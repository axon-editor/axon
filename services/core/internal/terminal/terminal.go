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
	Type   string `json:"type"`
	Offset int64  `json:"offset,omitempty"`
}

type terminalSession struct {
	id                string
	cmd               *exec.Cmd
	ptmx              *os.File
	clients           map[*terminalClient]bool
	scrollback        []byte
	baseOffset        int64
	totalBytes        int64
	replayProtections []terminalReplayProtection
	closed            bool
	mu                sync.Mutex
}

type terminalReplayProtection struct {
	offset    int64
	expiresAt time.Time
}

type terminalClient struct {
	ws                 *websocket.Conn
	send               chan []byte
	done               chan struct{}
	pendingBytes       int64
	acknowledgedOffset int64
	mu                 sync.Mutex
	closeOnce          sync.Once
}

const (
	maxScrollbackBytes            = 96 << 20
	terminalClientQueueSize       = 16384
	terminalClientMaxAckLagBytes  = 48 << 20
	terminalClientMaxPendingBytes = 24 << 20
	terminalReplayProtectionTTL   = 5 * time.Minute
	websocketPongWait             = 70 * time.Second
	websocketPingEvery            = 25 * time.Second
	websocketWriteWait            = 30 * time.Second
)

var terminalSessions = struct {
	sync.Mutex
	items map[string]*terminalSession
}{
	items: map[string]*terminalSession{},
}

// resolveWorkingDirectory decides where a new terminal session should start.
// The renderer sends the currently opened Axon folder as cwd, which is the
// most accurate source because it matches what the user is editing.
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

	// The PTY reader belongs to the session instead of a single websocket
	// because the UI can disappear independently of the shell. This lets Axon
	// behave like mature editors: a renderer reload, sleep/wake, or temporary
	// socket drop detaches the view but does not destroy the running command
	// unless the user explicitly closes the terminal tab.
	go func() {
		buf := make([]byte, 32*1024)
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
	session.dropExpiredReplayProtections(time.Now())

	if replayFrom >= session.totalBytes {
		client := newTerminalClient(ws, session.totalBytes)
		session.clients[client] = true
		return client, nil
	}
	if replayFrom < session.baseOffset {
		replayFrom = session.baseOffset
	}
	client := newTerminalClient(ws, replayFrom)
	session.clients[client] = true
	start := int(replayFrom - session.baseOffset)
	return client, append([]byte(nil), session.scrollback[start:]...)
}

func (session *terminalSession) removeClient(client *terminalClient) {
	if client == nil {
		return
	}
	session.mu.Lock()
	delete(session.clients, client)
	if !session.closed {
		session.protectReplayOffsetLocked(client.acknowledged(), time.Now())
	}
	session.mu.Unlock()
}

func (session *terminalSession) protectReplayOffsetLocked(offset int64, now time.Time) {
	if offset < session.baseOffset {
		offset = session.baseOffset
	}
	session.replayProtections = append(session.replayProtections, terminalReplayProtection{
		offset:    offset,
		expiresAt: now.Add(terminalReplayProtectionTTL),
	})
}

func (session *terminalSession) dropExpiredReplayProtections(now time.Time) {
	if len(session.replayProtections) == 0 {
		return
	}
	next := session.replayProtections[:0]
	for _, protection := range session.replayProtections {
		if now.Before(protection.expiresAt) {
			next = append(next, protection)
		}
	}
	session.replayProtections = next
}

func newTerminalClient(ws *websocket.Conn, acknowledgedOffset int64) *terminalClient {
	client := &terminalClient{
		ws:   ws,
		send: make(chan []byte, terminalClientQueueSize),
		done: make(chan struct{}),
	}
	client.acknowledgedOffset = acknowledgedOffset
	return client
}

func (client *terminalClient) enqueue(data []byte) bool {
	// PTY output is read from a reusable buffer, so each websocket client gets
	// its own copy before the next read mutates that backing array.
	chunk := append([]byte(nil), data...)

	client.mu.Lock()
	if client.pendingBytes+int64(len(chunk)) > terminalClientMaxPendingBytes {
		client.mu.Unlock()
		log.Printf(
			"terminal websocket client has %d pending bytes; detaching view for replay",
			client.pendingBytes,
		)
		return false
	}
	client.pendingBytes += int64(len(chunk))
	client.mu.Unlock()

	select {
	case client.send <- chunk:
		return true
	case <-client.done:
		client.releasePendingBytes(len(chunk))
		return false
	default:
		client.releasePendingBytes(len(chunk))
		log.Printf(
			"terminal websocket client queue is full; detaching view from acknowledged offset %d",
			client.acknowledged(),
		)
		return false
	}
}

func (client *terminalClient) releasePendingBytes(byteCount int) {
	if byteCount <= 0 {
		return
	}
	client.mu.Lock()
	client.pendingBytes -= int64(byteCount)
	if client.pendingBytes < 0 {
		client.pendingBytes = 0
	}
	client.mu.Unlock()
}

func (client *terminalClient) acknowledge(offset int64) {
	if offset < 0 {
		return
	}
	client.mu.Lock()
	if offset > client.acknowledgedOffset {
		client.acknowledgedOffset = offset
	}
	client.mu.Unlock()
}

func (client *terminalClient) acknowledged() int64 {
	client.mu.Lock()
	defer client.mu.Unlock()
	return client.acknowledgedOffset
}

func (client *terminalClient) close() {
	client.closeOnce.Do(func() {
		close(client.done)
		if client.ws != nil {
			_ = client.ws.Close()
		}
	})
}

func (client *terminalClient) startWriter(onError func()) func() {
	ticker := time.NewTicker(websocketPingEvery)

	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-client.done:
				return
			case data := <-client.send:
				client.releasePendingBytes(len(data))
				_ = client.ws.SetWriteDeadline(time.Now().Add(websocketWriteWait))
				if err := client.ws.WriteMessage(websocket.BinaryMessage, data); err != nil {
					client.close()
					onError()
					return
				}
			case <-ticker.C:
				_ = client.ws.SetWriteDeadline(time.Now().Add(websocketWriteWait))
				err := client.ws.WriteControl(
					websocket.PingMessage,
					nil,
					time.Now().Add(websocketWriteWait),
				)
				if err != nil {
					client.close()
					onError()
					return
				}
			}
		}
	}()

	return func() {
		client.close()
	}
}

func (session *terminalSession) broadcast(data []byte) {
	session.mu.Lock()
	if session.closed {
		session.mu.Unlock()
		return
	}
	session.scrollback = append(session.scrollback, data...)
	session.totalBytes += int64(len(data))
	now := time.Now()
	if len(session.scrollback) > maxScrollbackBytes {
		session.dropExpiredReplayProtections(now)
		trimTo := session.totalBytes - maxScrollbackBytes
		for client := range session.clients {
			if acknowledged := client.acknowledged(); acknowledged < trimTo {
				trimTo = acknowledged
			}
		}
		for _, protection := range session.replayProtections {
			if protection.offset < trimTo {
				trimTo = protection.offset
			}
		}
		if trimTo > session.baseOffset {
			// Core keeps a byte replay window so the renderer can reconnect
			// without killing the shell. Acknowledgements matter here: if xterm
			// has not reported that it finished writing a byte range, trimming
			// past that range means a reconnect cannot replay the missing text.
			// Detached clients get a short-lived protection as well. The renderer
			// intentionally waits for xterm's write queue before reconnecting, so
			// there can be a real period where no websocket is attached but the
			// view still needs old bytes for an exact replay cursor. The buffer
			// may temporarily grow past the preferred window during very chatty
			// tools, but preserving the replay point is the correct tradeoff for
			// terminal output integrity.
			trimmedBytes := int(trimTo - session.baseOffset)
			session.scrollback = session.scrollback[trimmedBytes:]
			session.baseOffset = trimTo
		}
	}
	clients := make([]*terminalClient, 0, len(session.clients))
	detachedClients := make([]*terminalClient, 0)
	for client := range session.clients {
		acknowledged := client.acknowledged()
		if session.totalBytes-acknowledged > terminalClientMaxAckLagBytes {
			// The renderer acknowledges bytes only after xterm has finished its
			// async write callback. A long-running agent can make the websocket
			// writer look healthy while the terminal view is actually tens of MB
			// behind. Keeping that client attached lets the browser keep falling
			// behind until the user sees missing or frozen output. Detaching here
			// protects the acknowledged replay cursor, lets the PTY reader keep
			// draining into session scrollback, and lets the renderer reconnect
			// from the last painted byte once its local xterm queue is settled.
			session.protectReplayOffsetLocked(acknowledged, now)
			delete(session.clients, client)
			detachedClients = append(detachedClients, client)
			continue
		}
		clients = append(clients, client)
	}
	session.mu.Unlock()

	for _, client := range detachedClients {
		client.close()
	}

	for _, client := range clients {
		if !client.enqueue(data) {
			session.removeClient(client)
			client.close()
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
		client.close()
	}
}

func (session *terminalSession) terminate() {
	session.finish()
}

func handleControlMessage(session *terminalSession, client *terminalClient, data []byte) (bool, bool) {
	var msg terminalControlMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		return false, false
	}
	switch msg.Type {
	case "terminate":
		session.terminate()
		return true, true
	case "ack":
		if client != nil {
			client.acknowledge(msg.Offset)
		}
		return true, false
	default:
		return false, false
	}
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
	_ = ws.SetReadDeadline(time.Now().Add(websocketPongWait))
	ws.SetPongHandler(func(string) error {
		return ws.SetReadDeadline(time.Now().Add(websocketPongWait))
	})

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
	stopWriter := client.startWriter(func() {
		session.removeClient(client)
	})
	defer stopWriter()
	if len(scrollback) > 0 {
		if !client.enqueue(scrollback) {
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

		if len(data) > 0 && data[0] == '{' {
			if handled, shouldClose := handleControlMessage(session, client, data); handled {
				if shouldClose {
					return
				}
				continue
			}
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
	// A conservative PATH fallback is added before the shell reads profile files
	// because packaged desktop apps often inherit a tiny launchd PATH. Profile
	// files can add nvm/asdf-specific paths afterward, but this baseline covers
	// common Homebrew, Go, Cargo, Bun, and local-bin installs so basic commands
	// are not missing before the user's shell customizations run.
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
