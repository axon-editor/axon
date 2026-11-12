// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package transcript

import (
	"encoding/json"
	"testing"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	store "github.com/GordenArcher/axon-core/internal/sessions"
)

func TestHistoryIncludesToolCalls(t *testing.T) {
	history := History([]components.Message{
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
}

func TestToggleThinkingTogglesEveryBlock(t *testing.T) {
	state := State{Messages: []components.Message{
		{Thinking: true, Collapsed: true},
		{Thinking: true, Collapsed: true},
		{Content: "answer"},
	}}

	state.ToggleThinking()
	for index := 0; index < 2; index++ {
		if state.Messages[index].Collapsed {
			t.Fatalf("thought %d did not expand", index)
		}
	}
	state.ToggleThinking()
	for index := 0; index < 2; index++ {
		if !state.Messages[index].Collapsed {
			t.Fatalf("thought %d did not collapse", index)
		}
	}
}

func TestToggleToolOutputTogglesMostRecentTool(t *testing.T) {
	state := State{Messages: []components.Message{
		{Tool: &components.Tool{Name: "first"}},
		{Tool: &components.Tool{Name: "second"}},
	}}

	state.ToggleToolOutput()
	if state.Messages[0].Tool.Expanded {
		t.Fatal("older tool card was toggled")
	}
	if !state.Messages[1].Tool.Expanded {
		t.Fatal("most recent tool card did not expand")
	}
	state.ToggleToolOutput()
	if state.Messages[1].Tool.Expanded {
		t.Fatal("tool card did not collapse")
	}
}

func TestThoughtPickerTogglesOneBlock(t *testing.T) {
	state := State{Messages: []components.Message{
		{Thinking: true, Collapsed: true, Content: "first thought"},
		{Thinking: true, Collapsed: true, Content: "second thought"},
		{Content: "answer"},
	}}
	if !state.OpenThoughtPicker() {
		t.Fatal("thought picker did not open")
	}
	if selected := state.ThoughtPicker.Selected().Index; selected != 1 {
		t.Fatalf("initial selection = %d, want the newest thought", selected)
	}

	option := state.ThoughtPicker.Selected()
	state.ToggleSelectedThought()
	if !state.Messages[0].Collapsed {
		t.Fatal("toggling the newest thought changed the older one")
	}
	if state.Messages[1].Collapsed {
		t.Fatal("selected thought did not expand")
	}
	if option.Index != 1 {
		t.Fatalf("selected option = %#v", option)
	}
}

func TestThoughtPickerWithoutThoughts(t *testing.T) {
	state := State{Messages: []components.Message{{Content: "answer"}}}
	if state.OpenThoughtPicker() {
		t.Fatal("picker opened with no thoughts")
	}
}

func TestToolCardPersistenceRoundTrip(t *testing.T) {
	state := NewState()
	state.AppendTool(client.Event{
		ToolCallID: "call-1",
		ToolName:   "read_file",
		Arguments:  `{"path":"main.go"}`,
	})
	state.FinishTool(client.Event{
		ToolCallID: "call-1",
		ToolName:   "read_file",
		Result:     "package main",
		OK:         true,
		DurationMS: 3,
	})

	rows := Persisted(state.Messages)
	// The welcome message has no ID, so only the tool card is persisted.
	if len(rows) != 1 || rows[0].Kind != "tool" {
		t.Fatalf("persisted rows = %#v", rows)
	}
	var tool components.Tool
	if err := json.Unmarshal([]byte(rows[0].Data), &tool); err != nil {
		t.Fatalf("decode tool row: %v", err)
	}
	if tool.Name != "read_file" || !tool.OK || tool.Result != "package main" {
		t.Fatalf("tool row did not round-trip: %#v", tool)
	}

	restored := FromRows([]store.Message{rows[0]})
	if len(restored) != 1 || restored[0].Tool == nil {
		t.Fatalf("tool card did not restore: %#v", restored)
	}
	if restored[0].Tool.Name != "read_file" {
		t.Fatalf("restored tool name = %q", restored[0].Tool.Name)
	}
}

func TestApprovalMarksWaitingCard(t *testing.T) {
	state := NewState()
	state.AppendWaitingTool(client.Event{
		ToolCallID: "call-1",
		ToolName:   "write_file",
	})
	state.MarkApproval(client.Decision{ID: "call-1", Approved: true})
	tool := state.ToolByCallID("call-1")
	if tool == nil || tool.Waiting || !tool.Running || tool.Approval != "once" {
		t.Fatalf("approved card = %#v", tool)
	}

	state.AppendWaitingTool(client.Event{ToolCallID: "call-2", ToolName: "run_command"})
	state.MarkApproval(client.Decision{ID: "call-2", Approved: false})
	denied := state.ToolByCallID("call-2")
	if denied == nil || denied.Running || denied.OK || denied.Approval != "denied" {
		t.Fatalf("denied card = %#v", denied)
	}
}
