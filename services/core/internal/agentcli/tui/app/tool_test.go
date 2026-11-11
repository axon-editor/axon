// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	store "github.com/GordenArcher/axon-core/internal/sessions"
)

func TestModelHistoryIncludesToolCalls(t *testing.T) {
	history := modelHistory([]components.Message{
		{Role: "assistant", Content: "welcome"},
		{ID: "u1", Role: "user", Content: "read main.go"},
		{ID: "t1", Role: "assistant", Thinking: true, Content: "planning"},
		{
			ID:   "c1",
			Role: "tool",
			Tool: &components.Tool{
				Name:      "read_file",
				Arguments: `{"path":"main.go"}`,
				Result:    "package main",
			},
		},
		{ID: "a1", Role: "assistant", Content: "It has a main package."},
	})

	if len(history) != 4 {
		t.Fatalf("expected user, tool call, tool result, and answer: %#v", history)
	}
	if history[0].Role != "user" || history[0].Content != "read main.go" {
		t.Fatalf("unexpected user turn: %#v", history[0])
	}
	if history[1].Role != "assistant" || len(history[1].ToolCalls) != 1 {
		t.Fatalf("unexpected tool call turn: %#v", history[1])
	}
	if history[1].ToolCalls[0].Function.Name != "read_file" {
		t.Fatalf("tool name = %q", history[1].ToolCalls[0].Function.Name)
	}
	if history[2].Role != "tool" || history[2].Content != "package main" {
		t.Fatalf("unexpected tool result: %#v", history[2])
	}
	if history[3].Role != "assistant" {
		t.Fatalf("unexpected final turn: %#v", history[3])
	}
}

func TestToggleToolOutputTogglesMostRecentTool(t *testing.T) {
	model := Model{messages: []components.Message{
		{Tool: &components.Tool{Name: "first"}},
		{Tool: &components.Tool{Name: "second"}},
	}}

	model.toggleToolOutput()
	if model.messages[0].Tool.Expanded {
		t.Fatal("older tool card was toggled")
	}
	if !model.messages[1].Tool.Expanded {
		t.Fatal("most recent tool card did not expand")
	}

	model.toggleToolOutput()
	if model.messages[1].Tool.Expanded {
		t.Fatal("tool card did not collapse")
	}
}

func TestToolCardPersistenceRoundTrip(t *testing.T) {
	sessions, err := store.OpenAt(filepath.Join(t.TempDir(), "sessions.db"))
	if err != nil {
		t.Fatalf("open session store: %v", err)
	}
	t.Cleanup(func() {
		_ = sessions.Close()
	})

	model := Model{
		workspace:      "/tmp/axon",
		modelID:        "axon-code",
		sessionID:      "s1",
		sessionTitle:   store.DefaultTitle,
		sessionCreated: time.Now(),
		sessions:       sessions,
		persisted:      make(map[string]bool),
	}

	model.appendTool(client.Event{
		ToolCallID: "call-1",
		ToolName:   "read_file",
		Arguments:  `{"path":"main.go"}`,
	})
	model.finishTool(client.Event{
		ToolCallID: "call-1",
		ToolName:   "read_file",
		Result:     "package main",
		OK:         true,
		DurationMS: 3,
	})
	if len(model.messages) != 1 || model.messages[0].Tool == nil {
		t.Fatalf("tool card was not appended: %#v", model.messages)
	}

	model.saveSession()
	loaded, err := sessions.LoadSession("s1")
	if err != nil {
		t.Fatalf("load saved session: %v", err)
	}
	if len(loaded.Messages) != 1 {
		t.Fatalf("expected one persisted row, got %#v", loaded.Messages)
	}
	if loaded.Messages[0].Kind != "tool" {
		t.Fatalf("tool row kind = %q", loaded.Messages[0].Kind)
	}

	var tool components.Tool
	if err := json.Unmarshal([]byte(loaded.Messages[0].Data), &tool); err != nil {
		t.Fatalf("decode tool row: %v", err)
	}
	if tool.Name != "read_file" || !tool.OK || tool.Result != "package main" {
		t.Fatalf("tool row did not round-trip: %#v", tool)
	}

	// A second save must not duplicate the card.
	model.saveSession()
	loaded, err = sessions.LoadSession("s1")
	if err != nil {
		t.Fatalf("reload saved session: %v", err)
	}
	if len(loaded.Messages) != 1 {
		t.Fatalf("saving twice duplicated the tool row: %#v", loaded.Messages)
	}

	restored := transcriptMessages(loaded.Messages)
	if len(restored) != 1 || restored[0].Tool == nil {
		t.Fatalf("tool card did not restore: %#v", restored)
	}
	if restored[0].Tool.Name != "read_file" {
		t.Fatalf("restored tool name = %q", restored[0].Tool.Name)
	}
}
