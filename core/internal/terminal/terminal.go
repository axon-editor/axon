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

	cmd := exec.Command(shell)
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")
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
