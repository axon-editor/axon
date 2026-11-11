// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"strings"
	"testing"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/pickers"
)

func TestStreamingStatusSitsBelowTranscript(t *testing.T) {
	model := NewModel("/tmp/axon", "axon-code", nil, false, nil)
	model.width = 100
	model.height = 30
	model.layout()
	model.streaming = true
	model.status = "Thinking..."

	view := model.View()
	statusIndex := strings.Index(view, "Working...")
	transcriptIndex := strings.Index(view, "What are we working on")
	composerIndex := strings.Index(view, "Ask Axon...")
	if statusIndex < 0 || transcriptIndex < 0 || composerIndex < 0 {
		t.Fatalf("status, transcript, or composer missing:\n%s", view)
	}
	if statusIndex < transcriptIndex || statusIndex > composerIndex {
		t.Fatalf("status should sit between the transcript and composer:\n%s", view)
	}
	if strings.Contains(view, "Λ▴") {
		t.Fatalf("the blinking Axon mark should not be the loader:\n%s", view)
	}
}

func TestStatusDisappearsWhileAnswerStreams(t *testing.T) {
	model := NewModel("/tmp/axon", "axon-code", nil, false, nil)
	model.width = 100
	model.height = 30
	model.layout()
	model.streaming = true
	model.responding = true

	if line := model.renderStatusLine(); line != "" {
		t.Fatalf("status should be empty while the answer streams: %q", line)
	}
}

func TestStatusDisappearsWhenThoughtContentArrives(t *testing.T) {
	model := NewModel("/tmp/axon", "axon-code", nil, false, nil)
	model.width = 100
	model.height = 30
	model.layout()
	model.streaming = true
	model.messages = append(model.messages, components.Message{
		ID:       "thought-1",
		Role:     "assistant",
		Thinking: true,
		Content:  "checking the workspace",
	})

	if line := model.renderStatusLine(); line != "" {
		t.Fatalf("status should be empty while a thought streams: %q", line)
	}
}

func TestStatusDisappearsWhenToolRuns(t *testing.T) {
	model := NewModel("/tmp/axon", "axon-code", nil, false, nil)
	model.width = 100
	model.height = 30
	model.layout()
	model.streaming = true
	model.messages = append(model.messages, components.Message{
		ID:   "tool-1",
		Role: "tool",
		Tool: &components.Tool{CallID: "call-1", Name: "shell", Running: true},
	})

	if line := model.renderStatusLine(); line != "" {
		t.Fatalf("status should be empty while a tool runs: %q", line)
	}
}

func TestSessionPickerHidesComposer(t *testing.T) {
	model := NewModel("/tmp/axon", "axon-code", nil, false, nil)
	model.width = 80
	model.height = 24
	model.layout()
	model.sessionPicker = pickers.NewSessionPicker([]pickers.SessionOption{
		{ID: "s1", Title: "Saved conversation"},
	}, "")
	model.sessionPickerOpen = true

	view := model.View()
	for _, forbidden := range []string{"Ask Axon...", "╭", "╰", "enter send"} {
		if strings.Contains(view, forbidden) {
			t.Fatalf("session picker still renders the composer %q:\n%s", forbidden, view)
		}
	}
	if !strings.Contains(view, "Saved conversation") {
		t.Fatalf("session picker is missing its list:\n%s", view)
	}
}
