// Handles PTY creation and WebSocket bridging using gorilla/websocket.
// Each connection gets its own shell process and PTY pair.
// Input from the WebSocket is written to the PTY, output from the PTY
// is written back to the WebSocket.
package terminal

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

// upgrader configures the WebSocket upgrader.
// CheckOrigin allows all origins since axon-core only runs locally.
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type terminalControlMessage struct {
	Type string `json:"type"`
}

type terminalSession struct {
	id         string
	cmd        *exec.Cmd
	ptmx       *os.File
	clients    map[*terminalClient]bool
	scrollback []byte
	baseOffset int64
	totalBytes int64
	closed     bool
	mu         sync.Mutex
}

type terminalClient struct {
	ws *websocket.Conn
	mu sync.Mutex
}

const maxScrollbackBytes = 1 << 20

var terminalSessions = struct {
	sync.Mutex
	items map[string]*terminalSession
}{
	items: map[string]*terminalSession{},
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

func createShellCommand(cwd string) *exec.Cmd {
	shell := os.Getenv("SHELL")
	if shell == "" || !filepath.IsAbs(shell) {
		shell = "/bin/zsh"
	}
	if _, err := os.Stat(shell); err != nil {
		shell = "/bin/bash"
	}

	cmd := exec.Command(shell, shellStartupArgs(shell)...)
	cmd.Env = terminalEnvironment()
	cmd.Dir = resolveWorkingDirectory(cwd)
	return cmd
}

func createSession(id string, cwd string) (*terminalSession, error) {
	if id == "" {
		id = createTerminalSessionID()
	}

	cmd := createShellCommand(cwd)

	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, err
	}

	session := &terminalSession{
		id:      id,
		cmd:     cmd,
		ptmx:    ptmx,
		clients: map[*terminalClient]bool{},
	}

	// I keep the PTY reader attached to the session instead of to a single
	// websocket because the UI can disappear independently of the shell. This
	// lets Axon behave like mature editors: a renderer reload, sleep/wake, or
	// temporary socket drop detaches the view but does not destroy the running
	// command unless the user explicitly closes the terminal tab.
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if err != nil {
				if err != io.EOF {
					log.Println("pty read error:", err)
				}
				session.finish()
				return
			}
			session.broadcast(buf[:n])
		}
	}()

	terminalSessions.Lock()
	terminalSessions.items[id] = session
	terminalSessions.Unlock()

	return session, nil
}

func createTerminalSessionID() string {
	return "terminal-" + time.Now().Format("20060102150405.000000000")
}

func getOrCreateSession(id string, cwd string) (*terminalSession, error) {
	terminalSessions.Lock()
	if session := terminalSessions.items[id]; session != nil {
		terminalSessions.Unlock()
		return session, nil
	}
	terminalSessions.Unlock()

	return createSession(id, cwd)
}

func (session *terminalSession) addClient(ws *websocket.Conn, replayFrom int64) (*terminalClient, []byte) {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.closed {
		return nil, nil
	}
	client := &terminalClient{ws: ws}
	session.clients[client] = true

	if replayFrom >= session.totalBytes {
		return client, nil
	}
	if replayFrom < session.baseOffset {
		replayFrom = session.baseOffset
	}
	start := int(replayFrom - session.baseOffset)
	return client, append([]byte(nil), session.scrollback[start:]...)
}

func (session *terminalSession) removeClient(client *terminalClient) {
	if client == nil {
		return
	}
	session.mu.Lock()
	delete(session.clients, client)
	session.mu.Unlock()
}

func (client *terminalClient) write(data []byte) error {
	client.mu.Lock()
	defer client.mu.Unlock()
	return client.ws.WriteMessage(websocket.TextMessage, data)
}

func (session *terminalSession) broadcast(data []byte) {
	session.mu.Lock()
	if session.closed {
		session.mu.Unlock()
		return
	}
	session.scrollback = append(session.scrollback, data...)
	session.totalBytes += int64(len(data))
	if len(session.scrollback) > maxScrollbackBytes {
		trimmedBytes := len(session.scrollback) - maxScrollbackBytes
		session.scrollback = session.scrollback[trimmedBytes:]
		session.baseOffset += int64(trimmedBytes)
	}
	clients := make([]*terminalClient, 0, len(session.clients))
	for client := range session.clients {
		clients = append(clients, client)
	}
	session.mu.Unlock()

	for _, client := range clients {
		if err := client.write(data); err != nil {
			session.removeClient(client)
			_ = client.ws.Close()
		}
	}
}

func (session *terminalSession) finish() {
	session.mu.Lock()
	if session.closed {
		session.mu.Unlock()
		return
	}
	session.closed = true
	clients := make([]*terminalClient, 0, len(session.clients))
	for client := range session.clients {
		clients = append(clients, client)
	}
	session.clients = map[*terminalClient]bool{}
	session.mu.Unlock()

	terminalSessions.Lock()
	delete(terminalSessions.items, session.id)
	terminalSessions.Unlock()

	_ = session.ptmx.Close()
	if session.cmd.Process != nil && session.cmd.ProcessState == nil {
		_ = session.cmd.Process.Kill()
	}
	_ = session.cmd.Wait()
	for _, client := range clients {
		_ = client.ws.Close()
	}
}

func (session *terminalSession) terminate() {
	session.finish()
}

func isTerminateMessage(data []byte) bool {
	var msg terminalControlMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		return false
	}
	return msg.Type == "terminate"
}

func parseReplayFrom(rawValue string) int64 {
	if rawValue == "" {
		return 0
	}
	value, err := strconv.ParseInt(rawValue, 10, 64)
	if err != nil || value < 0 {
		return 0
	}
	return value
}

// Handler upgrades the HTTP connection to WebSocket and attaches it to a PTY
// session owned by axon-core. The websocket is now only a transport for the
// visible terminal view; the shell lifetime belongs to the session map above.
func Handler(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("ws upgrade error:", err)
		return
	}
	defer ws.Close()

	session, err := getOrCreateSession(
		r.URL.Query().Get("sessionId"),
		r.URL.Query().Get("cwd"),
	)
	if err != nil {
		log.Println("pty start error:", err)
		return
	}

	client, scrollback := session.addClient(
		ws,
		parseReplayFrom(r.URL.Query().Get("replayFrom")),
	)
	if client == nil {
		return
	}
	if len(scrollback) > 0 {
		if err := client.write(scrollback); err != nil {
			session.removeClient(client)
			return
		}
	}
	defer session.removeClient(client)

	for {
		_, data, err := ws.ReadMessage()
		if err != nil {
			if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				log.Println("ws read error:", err)
			}
			return
		}

		if len(data) > 0 && data[0] == '{' && isTerminateMessage(data) {
			session.terminate()
			return
		}

		// Resize commands share this websocket with raw shell input. We only
		// consume the payload when it is actually an Axon resize message;
		// otherwise characters such as "{" must still reach the shell exactly
		// as the user typed them.
		if len(data) > 0 && data[0] == '{' && handleResize(session.ptmx, data) {
			continue
		}

		if _, err := session.ptmx.Write(data); err != nil {
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
	env = upsertEnvironmentValue(env, "PATH", nextPath)

	return append(env, "TERM=xterm-256color")
}

func upsertEnvironmentValue(env []string, key string, value string) []string {
	prefix := key + "="
	for index, entry := range env {
		if strings.HasPrefix(entry, prefix) {
			env[index] = prefix + value
			return env
		}
	}

	return append(env, prefix+value)
}
