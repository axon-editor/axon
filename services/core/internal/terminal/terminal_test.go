package terminal

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func terminalWebSocketURL(serverURL string, sessionID string) string {
	parsed, _ := url.Parse(serverURL)
	parsed.Scheme = "ws"
	parsed.Path = "/terminal"
	query := parsed.Query()
	query.Set("sessionId", sessionID)
	query.Set("replayFrom", "0")
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
	var output strings.Builder
	for time.Now().Before(deadline) {
		if err := conn.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
			t.Fatalf("set read deadline: %v", err)
		}
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
