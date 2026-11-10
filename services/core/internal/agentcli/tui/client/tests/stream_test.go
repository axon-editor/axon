// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package tests

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
	"testing"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
)

func TestStreamParsesToolLifecycle(t *testing.T) {
	const token = "test-token"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health":
			challenge := r.Header.Get("X-Axon-Challenge")
			mac := hmac.New(sha256.New, []byte(token))
			_, _ = mac.Write([]byte(challenge))
			w.Header().Set("X-Axon-Core-Proof", hex.EncodeToString(mac.Sum(nil)))
			w.WriteHeader(http.StatusOK)
		case "/ai/chat/stream":
			w.Header().Set("Content-Type", "application/x-ndjson")
			_, _ = fmt.Fprint(w,
				"{\"status\":\"success\",\"data\":{\"type\":\"tool_start\",\"tool_call_id\":\"c1\",\"tool_name\":\"read_file\",\"arguments\":{\"path\":\"main.go\"}}}\n"+
					"{\"status\":\"success\",\"data\":{\"type\":\"tool_result\",\"tool_call_id\":\"c1\",\"tool_name\":\"read_file\",\"result\":\"package main\",\"ok\":true,\"duration_ms\":5}}\n"+
					"{\"status\":\"success\",\"data\":{\"type\":\"delta\",\"delta\":\"Done\"}}\n"+
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

	events := make(chan client.Event, 16)
	client.Stream(context.Background(), client.Request{
		Prompt:     "read main.go",
		FolderPath: home,
		Model:      "axon-code",
	}, events)

	var start, result client.Event
	var delta string
	sawDone := false
	for event := range events {
		switch event.Kind {
		case client.ToolStart:
			start = event
		case client.ToolResult:
			result = event
		case client.Delta:
			delta += event.Text
		case client.Done:
			sawDone = true
		}
	}

	if start.ToolCallID != "c1" || start.ToolName != "read_file" {
		t.Fatalf("unexpected tool start: %#v", start)
	}
	if result.ToolCallID != "c1" || !result.OK || result.Result != "package main" || result.DurationMS != 5 {
		t.Fatalf("unexpected tool result: %#v", result)
	}
	if delta != "Done" || !sawDone {
		t.Fatalf("stream did not finish cleanly: delta=%q done=%t", delta, sawDone)
	}
}
