// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package agent

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
)

func TestRunApprovesAndExecutesWrite(t *testing.T) {
	const token = "agent-test-token"
	requests := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health":
			challenge := r.Header.Get("X-Axon-Challenge")
			mac := hmac.New(sha256.New, []byte(token))
			_, _ = mac.Write([]byte(challenge))
			w.Header().Set("X-Axon-Core-Proof", hex.EncodeToString(mac.Sum(nil)))
			w.WriteHeader(http.StatusOK)
		case "/ai/tool-definitions":
			_, _ = fmt.Fprint(w, `{"status":"success","data":[]}`)
		case "/ai/chat/stream":
			requests++
			if requests == 1 {
				_, _ = fmt.Fprint(w,
					"{\"status\":\"success\",\"data\":{\"type\":\"thought\",\"thought\":\"writing the file\"}}\n"+
						"{\"status\":\"success\",\"data\":{\"type\":\"done\",\"done\":true,\"tool_calls\":[{\"function\":{\"name\":\"write_file\",\"arguments\":{\"path\":\"note.txt\",\"content\":\"hello\"}}}]}}\n",
				)
				return
			}
			_, _ = fmt.Fprint(w,
				"{\"status\":\"success\",\"data\":{\"type\":\"delta\",\"delta\":\"Wrote the file.\"}}\n"+
					"{\"status\":\"success\",\"data\":{\"type\":\"done\",\"done\":true}}\n",
			)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	parsed, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse test server url: %v", err)
	}
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("AXON_CORE_TOKEN", "")
	if err := os.MkdirAll(filepath.Join(home, ".axon"), 0o755); err != nil {
		t.Fatalf("create axon home: %v", err)
	}
	if err := os.WriteFile(filepath.Join(home, ".axon", "core.port"), []byte(parsed.Port()), 0o644); err != nil {
		t.Fatalf("write core port: %v", err)
	}
	if err := os.WriteFile(filepath.Join(home, ".axon", "core.token"), []byte(token), 0o644); err != nil {
		t.Fatalf("write core token: %v", err)
	}

	workspace := t.TempDir()
	decisions := make(chan client.Decision, 1)
	events := make(chan client.Event, 64)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	go Run(ctx, client.Request{
		Prompt:     "write note.txt",
		FolderPath: workspace,
		Model:      "axon-code",
		Decisions:  decisions,
	}, events)

	var sawApproval, sawStart, sawResult, sawDelta, sawDone bool
	for event := range events {
		switch event.Kind {
		case client.ApprovalRequest:
			sawApproval = true
			if event.ToolName != "write_file" {
				t.Fatalf("approval requested for %q", event.ToolName)
			}
			decisions <- client.Decision{ID: event.ToolCallID, Approved: true}
		case client.ToolStart:
			sawStart = true
			if event.Approval != "once" {
				t.Fatalf("tool start approval = %q", event.Approval)
			}
		case client.ToolResult:
			sawResult = true
			if !event.OK || !strings.Contains(event.Result, "Wrote") {
				t.Fatalf("tool result = %#v", event)
			}
		case client.Delta:
			sawDelta = true
			if event.Text != "Wrote the file." {
				t.Fatalf("delta = %q", event.Text)
			}
		case client.Done:
			sawDone = true
		case client.Error:
			t.Fatalf("agent error: %s", event.Text)
		}
	}

	if !sawApproval || !sawStart || !sawResult || !sawDelta || !sawDone {
		t.Fatalf(
			"missing events: approval=%t start=%t result=%t delta=%t done=%t",
			sawApproval, sawStart, sawResult, sawDelta, sawDone,
		)
	}
	raw, err := os.ReadFile(filepath.Join(workspace, "note.txt"))
	if err != nil {
		t.Fatalf("read written file: %v", err)
	}
	if string(raw) != "hello" {
		t.Fatalf("file content = %q", raw)
	}
}
