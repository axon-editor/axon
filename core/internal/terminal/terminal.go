// Handles PTY creation and WebSocket bridging using gorilla/websocket.
// Each connection gets its own shell process and PTY pair.
// Input from the WebSocket is written to the PTY, output from the PTY
// is written back to the WebSocket.
package terminal

import (
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

// upgrader configures the WebSocket upgrader.
// CheckOrigin allows all origins since axon-core only runs locally.
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// resolveWorkingDirectory decides where a new terminal session should start.
// The renderer sends the currently opened Axon folder as cwd, which is the
// most accurate source because it matches what the user is editing.
//
// During local development the Go server is often launched from core/, so the
// fallback walks one level up when that directory shape is detected. Without
// this fallback, opening Axon from the repo root still drops shells into core/,
// which makes the terminal feel detached from the project.
func resolveWorkingDirectory(requested string) string {
	if requested != "" {
		if info, err := os.Stat(requested); err == nil && info.IsDir() {
			return filepath.Clean(requested)
		}
	}

	current, err := os.Getwd()
	if err != nil {
		return ""
	}

	if filepath.Base(current) == "core" {
		parent := filepath.Dir(current)
		if info, err := os.Stat(parent); err == nil && info.IsDir() {
			return parent
		}
	}

	return current
}

// Handler upgrades the HTTP connection to WebSocket and spawns a shell.
// Shell is zsh on Mac, falls back to SHELL env var, then /bin/bash.
func Handler(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("ws upgrade error:", err)
		return
	}
	defer ws.Close()

	// prefer zsh on darwin, fall back to SHELL env, then bash
	shell := "/bin/zsh"
	if _, err := os.Stat(shell); os.IsNotExist(err) {
		shell = os.Getenv("SHELL")
		if shell == "" {
			shell = "/bin/bash"
		}
	}

	cmd := exec.Command(shell, shellStartupArgs(shell)...)
	cmd.Env = terminalEnvironment()
	cmd.Dir = resolveWorkingDirectory(r.URL.Query().Get("cwd"))

	ptmx, err := pty.Start(cmd)
	if err != nil {
		log.Println("pty start error:", err)
		return
	}
	defer func() {
		ptmx.Close()
		cmd.Process.Kill()
	}()

	// copy PTY output to WebSocket
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if err != nil {
				if err != io.EOF {
					log.Println("pty read error:", err)
				}
				return
			}
			if err := ws.WriteMessage(websocket.TextMessage, buf[:n]); err != nil {
				return
			}
		}
	}()

	// copy WebSocket input to PTY
	for {
		_, data, err := ws.ReadMessage()
		if err != nil {
			if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				log.Println("ws read error:", err)
			}
			return
		}

		// Resize commands share this websocket with raw shell input. We only
		// consume the payload when it is actually an Axon resize message;
		// otherwise characters such as "{" must still reach the shell exactly
		// as the user typed them.
		if len(data) > 0 && data[0] == '{' && handleResize(ptmx, data) {
			continue
		}

		if _, err := ptmx.Write(data); err != nil {
			return
		}
	}
}

func shellStartupArgs(shellPath string) []string {
	// Axon is launched from a GUI app more often than a login terminal. On macOS
	// that means the process can miss the user's normal shell startup files,
	// which is why commands like npm, pnpm, bun, or go may exist in Terminal.app
	// but not in Axon's integrated terminal. Starting the shell as login +
	// interactive gives zsh/bash the same chance to load profile files that a
	// normal developer terminal gets.
	switch filepath.Base(shellPath) {
	case "zsh":
		return []string{"-l", "-i"}
	case "bash":
		return []string{"--login", "-i"}
	default:
		return nil
	}
}

func terminalEnvironment() []string {
	// I still add a conservative PATH fallback before the shell reads profile
	// files because packaged desktop apps often inherit a tiny launchd PATH.
	// Profile files can add nvm/asdf-specific paths afterward, but this baseline
	// covers common Homebrew, Go, Cargo, Bun, and local-bin installs so basic
	// commands are not missing before the user's shell customizations run.
	env := os.Environ()
	pathValue := os.Getenv("PATH")
	if pathValue == "" {
		pathValue = "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
	}

	home, _ := os.UserHomeDir()
	extraPaths := []string{
		"/opt/homebrew/bin",
		"/opt/homebrew/sbin",
		"/usr/local/bin",
		"/usr/local/sbin",
		"/usr/bin",
		"/bin",
		"/usr/sbin",
		"/sbin",
	}
	if home != "" {
		extraPaths = append(extraPaths,
			filepath.Join(home, ".local", "bin"),
			filepath.Join(home, "bin"),
			filepath.Join(home, "go", "bin"),
			filepath.Join(home, ".cargo", "bin"),
			filepath.Join(home, ".bun", "bin"),
			filepath.Join(home, ".npm-global", "bin"),
		)
	}

	seen := map[string]bool{}
	parts := []string{}
	for _, entry := range strings.Split(pathValue, string(os.PathListSeparator)) {
		if entry == "" || seen[entry] {
			continue
		}
		seen[entry] = true
		parts = append(parts, entry)
	}
	for _, entry := range extraPaths {
		if entry == "" || seen[entry] {
			continue
		}
		seen[entry] = true
		parts = append(parts, entry)
	}

	nextPath := strings.Join(parts, string(os.PathListSeparator))
	replacedPath := false
	for index, entry := range env {
		if strings.HasPrefix(entry, "PATH=") {
			env[index] = "PATH=" + nextPath
			replacedPath = true
			break
		}
	}
	if !replacedPath {
		env = append(env, "PATH="+nextPath)
	}

	return append(env, "TERM=xterm-256color")
}
