package terminal

import (
	"bytes"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestTerminalEnvironmentAdvertisesAxonCapabilities(t *testing.T) {
	t.Setenv("TERM", "dumb")
	t.Setenv("COLORTERM", "legacy")
	t.Setenv("CLICOLOR", "0")
	t.Setenv("TERM_PROGRAM", "Terminal.app")
	t.Setenv("NO_COLOR", "1")

	env := terminalEnvironment()
	wanted := map[string]string{
		"TERM":         "xterm-256color",
		"COLORTERM":    "truecolor",
		"CLICOLOR":     "1",
		"TERM_PROGRAM": "Axon",
		"AXON_TERM":    "true",
	}

	for key, expected := range wanted {
		prefix := key + "="
		matches := 0
		for _, entry := range env {
			if strings.HasPrefix(entry, prefix) {
				matches++
				if entry != prefix+expected {
					t.Fatalf("expected %s, got %s", prefix+expected, entry)
				}
			}
		}
		if matches != 1 {
			t.Fatalf("expected one %s entry, got %d", key, matches)
		}
	}

	if os.Getenv("TERM") != "dumb" {
		t.Fatalf("terminal environment mutated the core process environment")
	}
	for _, entry := range env {
		if strings.HasPrefix(entry, "NO_COLOR=") {
			t.Fatalf("interactive terminal inherited NO_COLOR")
		}
	}
}

func terminalWebSocketURL(serverURL string, sessionID string) string {
	parsed, _ := url.Parse(serverURL)
	parsed.Scheme = "ws"
	parsed.Path = "/terminal"
	query := parsed.Query()
	query.Set("sessionId", sessionID)
	query.Set("replayFrom", "0")
	query.Set("cwd", os.TempDir())
	query.Set("workspaceRoot", os.TempDir())
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func TestTerminalHighVolumeOutputIsDelivered(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(Handler))
	defer server.Close()

	conn, _, err := websocket.DefaultDialer.Dial(
		terminalWebSocketURL(server.URL, fmt.Sprintf("test-%d", time.Now().UnixNano())),
		nil,
	)
	if err != nil {
		t.Fatalf("dial terminal websocket: %v", err)
	}
	defer conn.Close()

	const lineCount = 1500
	const doneMarker = "AXON_STREAM_DONE"
	command := fmt.Sprintf(
		"i=0; while [ $i -lt %[1]d ]; do printf 'AXON_STREAM_%%04d\\r\\n' \"$i\"; i=$((i+1)); done; printf 'AXON_STREAM_'DONE'\\r\\n'\r",
		lineCount,
	)
	if err := conn.WriteMessage(websocket.TextMessage, []byte(command)); err != nil {
		t.Fatalf("write terminal command: %v", err)
	}

	deadline := time.Now().Add(20 * time.Second)
	// The shell is started as an interactive login shell, so profile scripts can
	// legitimately delay the first PTY frame when the machine is also building
	// the renderer. A two-second deadline on every read made this integrity test
	// report output loss before any output had arrived. The single end-to-end
	// deadline still fails a stalled or truncated stream, while measuring the
	// behavior the test actually promises: all markers arrive within 20 seconds.
	if err := conn.SetReadDeadline(deadline); err != nil {
		t.Fatalf("set terminal stream deadline: %v", err)
	}
	var output strings.Builder
	for time.Now().Before(deadline) {
		_, data, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("read terminal output: %v", err)
		}
		output.Write(data)
		if strings.Contains(output.String(), doneMarker) {
			break
		}
	}

	terminalOutput := output.String()
	if !strings.Contains(terminalOutput, doneMarker) {
		t.Fatalf("terminal stream did not finish before timeout")
	}

	// This test exercises the same backend path used by long-running agent
	// commands: PTY read, session scrollback append, websocket client queue, and
	// websocket writer. Checking every numbered marker catches the regression
	// where a full client queue or reconnect path makes output visually skip.
	for index := 0; index < lineCount; index++ {
		marker := fmt.Sprintf("AXON_STREAM_%04d", index)
		if !strings.Contains(terminalOutput, marker) {
			t.Fatalf(
				"terminal output lost marker %q; captured %d bytes, first output: %q",
				marker,
				len(terminalOutput),
				terminalOutput[:min(len(terminalOutput), 800)],
			)
		}
	}

	_ = conn.WriteJSON(terminalControlMessage{Type: "terminate"})
}

func TestTerminalExitDrainsFinalOutputBeforeSocketClose(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(Handler))
	defer server.Close()

	conn, _, err := websocket.DefaultDialer.Dial(
		terminalWebSocketURL(server.URL, fmt.Sprintf("tail-%d", time.Now().UnixNano())),
		nil,
	)
	if err != nil {
		t.Fatalf("dial terminal websocket: %v", err)
	}
	defer conn.Close()

	const finalMarker = "AXON_FINAL_OUTPUT_WITHOUT_NEWLINE"
	if err := conn.WriteMessage(
		websocket.TextMessage,
		[]byte("printf '"+finalMarker+"'; exit\r"),
	); err != nil {
		t.Fatalf("write terminal exit command: %v", err)
	}

	var output strings.Builder
	for {
		_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		_, data, readErr := conn.ReadMessage()
		if readErr != nil {
			if websocket.IsCloseError(readErr, websocket.CloseNormalClosure) {
				break
			}
			t.Fatalf("terminal closed before a clean output drain: %v", readErr)
		}
		output.Write(data)
	}

	if !strings.Contains(output.String(), finalMarker) {
		t.Fatalf("terminal exit ate its final output; captured %q", output.String())
	}
}

func TestTerminalRejectsUntrustedBrowserOrigin(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(Handler))
	defer server.Close()

	headers := http.Header{}
	headers.Set("Origin", "https://attacker.example")
	conn, response, err := websocket.DefaultDialer.Dial(
		terminalWebSocketURL(server.URL, "hostile-origin"),
		headers,
	)
	if conn != nil {
		_ = conn.Close()
	}
	if err == nil {
		t.Fatal("expected hostile terminal origin to fail the WebSocket upgrade")
	}
	if response == nil || response.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 for hostile terminal origin, got %#v", response)
	}
}

func TestTerminalAcknowledgementCannotAdvancePastProducedOutput(t *testing.T) {
	client := newTerminalClient(nil, 5)
	client.advanceScheduled(10)
	session := &terminalSession{baseOffset: 4, totalBytes: 10}

	session.acknowledge(client, 1_000_000)
	if acknowledged := client.acknowledged(); acknowledged != session.totalBytes {
		t.Fatalf("expected acknowledgement to clamp at %d, got %d", session.totalBytes, acknowledged)
	}
}

func TestTerminalReplayUsesAcknowledgedBoundedChunks(t *testing.T) {
	payload := make([]byte, 25<<20)
	for index := range payload {
		payload[index] = byte(index % 251)
	}
	client := newTerminalClient(nil, 0)
	session := &terminalSession{
		id:         "bounded-replay-test",
		clients:    map[*terminalClient]bool{client: true},
		scrollback: payload,
		totalBytes: int64(len(payload)),
	}

	session.mu.Lock()
	pumped := session.pumpClientLocked(client)
	session.mu.Unlock()
	if !pumped {
		t.Fatal("expected replay pump to accept the initial delivery window")
	}
	acknowledged, scheduled := client.deliveryOffsets()
	if acknowledged != 0 || scheduled != terminalClientFlowWindowBytes {
		t.Fatalf("expected a %d-byte initial window, got ack=%d scheduled=%d", terminalClientFlowWindowBytes, acknowledged, scheduled)
	}
	if len(client.send) != terminalClientFlowWindowBytes/terminalReplayChunkBytes {
		t.Fatalf("expected replay to be split into bounded frames, got %d frames", len(client.send))
	}
	var replay bytes.Buffer
	for {
		for len(client.send) > 0 {
			chunk := <-client.send
			if len(chunk) > terminalReplayChunkBytes {
				t.Fatalf("replay frame exceeded %d bytes: %d", terminalReplayChunkBytes, len(chunk))
			}
			replay.Write(chunk)
			client.releasePendingBytes(len(chunk))
		}
		_, scheduled = client.deliveryOffsets()
		if scheduled >= session.totalBytes {
			break
		}
		session.acknowledge(client, scheduled)
	}
	if !bytes.Equal(replay.Bytes(), payload) {
		t.Fatalf("expected byte-exact replay of %d bytes, got %d", len(payload), replay.Len())
	}
	if len(session.clients) != 1 {
		t.Fatalf("expected slow replay client to stay attached, got %d clients", len(session.clients))
	}
}

func TestTerminalClientPendingBytesReleaseAfterWriteAccounting(t *testing.T) {
	client := &terminalClient{
		send: make(chan []byte, 1),
		done: make(chan struct{}),
	}

	if !client.enqueue([]byte("hello")) {
		t.Fatalf("expected enqueue to accept first chunk")
	}
	if client.pendingBytes != 5 {
		t.Fatalf("expected pending bytes to count queued data, got %d", client.pendingBytes)
	}

	client.releasePendingBytes(5)
	if client.pendingBytes != 0 {
		t.Fatalf("expected pending bytes to release after write accounting, got %d", client.pendingBytes)
	}
}

func TestTerminalReconnectRejectsAnotherWorkspace(t *testing.T) {
	sessionID := "workspace-bound-session"
	terminalSessions.Lock()
	terminalSessions.items[sessionID] = &terminalSession{
		id:            sessionID,
		workspaceRoot: filepath.Join(string(os.PathSeparator), "workspace-a"),
		clients:       map[*terminalClient]bool{},
	}
	terminalSessions.Unlock()
	defer func() {
		terminalSessions.Lock()
		delete(terminalSessions.items, sessionID)
		terminalSessions.Unlock()
	}()

	_, err := getOrCreateSession(
		sessionID,
		os.TempDir(),
		filepath.Join(string(os.PathSeparator), "workspace-b"),
	)
	if !errors.Is(err, errTerminalWorkspaceMismatch) {
		t.Fatalf("expected workspace mismatch, got %v", err)
	}
}

func TestTerminalHealthSnapshotIncludesSessions(t *testing.T) {
	client := newTerminalClient(nil, 2)
	client.maxWriteTime = 20 * time.Microsecond
	session := &terminalSession{
		id: "health-test",
		clients: map[*terminalClient]bool{
			client: true,
		},
		scrollback:        []byte("hello"),
		totalBytes:        5,
		createdAt:         time.Now(),
		lastOutputAt:      time.Now(),
		lastBroadcastTime: 15 * time.Microsecond,
		maxBroadcastTime:  30 * time.Microsecond,
	}

	terminalSessions.Lock()
	terminalSessions.items[session.id] = session
	terminalSessions.Unlock()
	defer func() {
		terminalSessions.Lock()
		delete(terminalSessions.items, session.id)
		terminalSessions.Unlock()
	}()

	snapshot := HealthSnapshot()
	found := false
	for _, item := range snapshot.Sessions {
		if item.ID != session.id {
			continue
		}
		found = true
		if item.ScrollbackBytes != 5 || item.TotalBytes != 5 {
			t.Fatalf("unexpected health byte counts: %+v", item)
		}
		if item.MaxAckLagBytes != 3 {
			t.Fatalf("expected max ack lag to describe renderer distance, got %+v", item)
		}
		if item.LastBroadcastMicros != 15 || item.MaxBroadcastMicros != 30 || item.MaxClientWriteMicros != 20 {
			t.Fatalf("unexpected terminal latency metrics: %+v", item)
		}
	}
	if !found {
		t.Fatalf("expected health snapshot to include %q", session.id)
	}
}
