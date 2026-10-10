// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package kernelhost

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// TestLiveKernelHostBridge exercises the whole host path: ticket issuance,
// WebSocket attach, execute, streamed output, and the correlated reply. It needs a
// real interpreter with ipykernel, so it only runs when AXON_JUPYTER_TEST_PYTHON
// points at one (for example a venv bin/python).
func TestLiveKernelHostBridge(t *testing.T) {
	python := strings.TrimSpace(os.Getenv("AXON_JUPYTER_TEST_PYTHON"))
	if python == "" {
		t.Skip("set AXON_JUPYTER_TEST_PYTHON to run the live kernel host bridge test")
	}

	workspace := t.TempDir()
	notebook := filepath.Join(workspace, "session.ipynb")

	host := New("integration-token")
	server := httptest.NewServer(host.Router())
	defer server.Close()

	ticketBody, _ := json.Marshal(map[string]string{
		"sessionId":     "session-live",
		"cwd":           workspace,
		"workspaceRoot": workspace,
		"notebookPath":  notebook,
		"interpreter":   python,
		"kernelName":    "python3",
	})
	request, err := http.NewRequest(http.MethodPost, server.URL+"/kernel/ticket", bytes.NewReader(ticketBody))
	if err != nil {
		t.Fatalf("build ticket request: %v", err)
	}
	request.Header.Set("Authorization", "Bearer integration-token")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("ticket request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("ticket status = %d", response.StatusCode)
	}
	var issued struct {
		Data map[string]string `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&issued); err != nil {
		t.Fatalf("decode ticket: %v", err)
	}
	ticket := issued.Data["ticket"]
	if ticket == "" {
		t.Fatal("no ticket issued")
	}

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/kernel?sessionId=session-live&ticket=" + ticket
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial kernel websocket: %v", err)
	}
	defer conn.Close()

	_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	code, _ := json.Marshal(clientMessage{Type: clientExecute, ID: "cell-1", Code: "print('axon-kernel-host')"})
	if err := conn.WriteMessage(websocket.TextMessage, code); err != nil {
		t.Fatalf("write execute: %v", err)
	}

	var sawStream, sawReply bool
	for !sawStream || !sawReply {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("read host message (stream=%v reply=%v): %v", sawStream, sawReply, err)
		}
		var message struct {
			Type    string          `json:"type"`
			ID      string          `json:"id"`
			MsgType string          `json:"msgType"`
			Content json.RawMessage `json:"content"`
		}
		if err := json.Unmarshal(raw, &message); err != nil {
			t.Fatalf("decode host message: %v", err)
		}
		switch message.Type {
		case serverIOPub:
			if message.ID != "cell-1" || message.MsgType != "stream" {
				continue
			}
			var stream struct {
				Text string `json:"text"`
			}
			_ = json.Unmarshal(message.Content, &stream)
			if strings.Contains(stream.Text, "axon-kernel-host") {
				sawStream = true
			}
		case serverReply:
			if message.ID == "cell-1" {
				sawReply = true
			}
		case serverError:
			t.Fatalf("host reported error: %s", string(raw))
		}
	}
}
