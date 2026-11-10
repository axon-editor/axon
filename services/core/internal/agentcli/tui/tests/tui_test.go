// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package tests

import (
	"strings"
	"testing"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/app"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	tea "github.com/charmbracelet/bubbletea"
)

func TestTranscriptRendersRoles(t *testing.T) {
	rendered := components.Render([]components.Message{
		{Role: "user", Content: "hello"},
		{Role: "assistant", Content: "hi there"},
	}, 80)

	for _, expected := range []string{"You", "hello", "Axon", "hi there"} {
		if !strings.Contains(rendered, expected) {
			t.Fatalf("transcript is missing %q:\n%s", expected, rendered)
		}
	}
}

func TestModelViewRendersHeader(t *testing.T) {
	model := app.NewModel("/tmp/axon", "axon-code")
	updated, _ := model.Update(tea.WindowSizeMsg{Width: 80, Height: 24})
	view := updated.(app.Model).View()

	for _, expected := range []string{"Axon", "axon", "axon-code"} {
		if !strings.Contains(view, expected) {
			t.Fatalf("view is missing %q:\n%s", expected, view)
		}
	}
}
