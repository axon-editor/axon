// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package transcript

import (
	"strings"
	"testing"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	"github.com/charmbracelet/x/ansi"
)

func TestActiveThoughtUsesSpinner(t *testing.T) {
	renderer := New()
	renderer.SetWidth(80)
	renderer.SetActivity("⠋", "thought-1", "")

	rendered := ansi.Strip(renderer.Render([]components.Message{
		{ID: "thought-1", Thinking: true, Content: "checking"},
	}, -1))
	if !strings.Contains(rendered, "⠋ Thinking") {
		t.Fatalf("active thought is missing the spinner header:\n%s", rendered)
	}
	if strings.Contains(rendered, "▸ Thought") {
		t.Fatalf("active thought still shows the static marker:\n%s", rendered)
	}
}

func TestActiveToolUsesSpinner(t *testing.T) {
	renderer := New()
	renderer.SetWidth(80)
	renderer.SetActivity("⠋", "", "call-1")

	rendered := ansi.Strip(renderer.Render([]components.Message{
		{
			ID:   "tool-1",
			Role: "tool",
			Tool: &components.Tool{
				CallID:  "call-1",
				Name:    "shell",
				Running: true,
			},
		},
	}, -1))
	if !strings.Contains(rendered, "⠋ shell") {
		t.Fatalf("running tool is missing the spinner header:\n%s", rendered)
	}
	if strings.Contains(rendered, "▸ shell") {
		t.Fatalf("running tool still shows the static marker:\n%s", rendered)
	}
}

func TestRendererTracksMessageOffsets(t *testing.T) {
	renderer := New()
	renderer.SetWidth(60)
	renderer.Render([]components.Message{
		{ID: "user", Role: "user", Content: "first"},
		{ID: "answer", Role: "assistant", Content: "second"},
	}, -1)

	userOffset, ok := renderer.OffsetFor("user")
	if !ok || userOffset != 0 {
		t.Fatalf("user offset = %d, %t", userOffset, ok)
	}
	answerOffset, ok := renderer.OffsetFor("answer")
	if !ok || answerOffset <= userOffset {
		t.Fatalf("answer offset = %d, %t", answerOffset, ok)
	}
}
