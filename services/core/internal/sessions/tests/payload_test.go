// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package tests

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/GordenArcher/axon-core/internal/sessions/payload"
	"github.com/GordenArcher/axon-core/internal/sessions/session"
)

func TestPayloadRoundTrip(t *testing.T) {
	raw, err := payload.Encode(payload.Meta{
		ID:        "session-1",
		Title:     "Shared conversation",
		CreatedAt: time.Now(),
	}, []session.Message{
		{ID: "u1", Role: "user", Content: "read main.go"},
		{ID: "t1", Role: "assistant", Thinking: true, Collapsed: true, Content: "planning"},
		{
			ID:   "c1",
			Role: "tool",
			Kind: "tool",
			Data: `{"callId":"call-1","name":"read_file","arguments":"{\"path\":\"main.go\"}","result":"package main","ok":true,"durationMs":5}`,
		},
		{ID: "a1", Role: "assistant", Content: "It is a main package."},
	})
	if err != nil {
		t.Fatalf("encode payload: %v", err)
	}
	for _, expected := range []string{
		`"timeline"`,
		`"kind":"thought"`,
		`"name":"read_file"`,
		`"status":"done"`,
	} {
		if !strings.Contains(raw, expected) {
			t.Fatalf("payload is missing %q: %s", expected, raw)
		}
	}

	messages, err := payload.Decode(raw)
	if err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	if len(messages) != 4 {
		t.Fatalf("expected 4 transcript rows, got %#v", messages)
	}
	if messages[0].Role != "user" || messages[0].Content != "read main.go" {
		t.Fatalf("unexpected user row: %#v", messages[0])
	}
	if !messages[1].Thinking || messages[1].Content != "planning" {
		t.Fatalf("unexpected thought row: %#v", messages[1])
	}
	if messages[2].Kind != "tool" {
		t.Fatalf("unexpected tool row: %#v", messages[2])
	}

	var tool struct {
		Name   string `json:"name"`
		Result string `json:"result"`
		OK     bool   `json:"ok"`
	}
	if err := json.Unmarshal([]byte(messages[2].Data), &tool); err != nil {
		t.Fatalf("decode tool row: %v", err)
	}
	if tool.Name != "read_file" || tool.Result != "package main" || !tool.OK {
		t.Fatalf("tool did not round-trip: %#v", tool)
	}
	if messages[3].Role != "assistant" || messages[3].Content != "It is a main package." {
		t.Fatalf("unexpected final row: %#v", messages[3])
	}
}
