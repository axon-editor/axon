// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package tests

import (
	"strings"
	"testing"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/app"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	"github.com/GordenArcher/axon-core/internal/ai"
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

func TestThinkingCollapses(t *testing.T) {
	expanded := components.Render([]components.Message{
		{Thinking: true, Content: "plan the change"},
	}, 80)
	if !strings.Contains(expanded, "plan the change") {
		t.Fatalf("expanded thought is missing content:\n%s", expanded)
	}

	collapsed := components.Render([]components.Message{
		{Thinking: true, Content: "plan the change", Collapsed: true},
	}, 80)
	if strings.Contains(collapsed, "plan the change") {
		t.Fatalf("collapsed thought still shows content:\n%s", collapsed)
	}
	if !strings.Contains(collapsed, "Thought") {
		t.Fatalf("collapsed thought is missing its label:\n%s", collapsed)
	}
}

func TestModelPickerMovesAndRenders(t *testing.T) {
	picker := components.NewModelPicker([]ai.ModelInfo{
		{ID: "one", Label: "One", Available: true},
		{ID: "two", Label: "Two", Available: false},
	}, "one")

	if picker.SelectedID() != "one" {
		t.Fatalf("expected initial selection one, got %q", picker.SelectedID())
	}
	if !picker.SelectedAvailable() {
		t.Fatal("expected the initial model to be available")
	}

	picker.Move(1)
	if picker.SelectedID() != "two" {
		t.Fatalf("expected selection two, got %q", picker.SelectedID())
	}
	if picker.SelectedAvailable() {
		t.Fatal("expected the second model to be unavailable")
	}

	view := picker.View(80, 10)
	for _, expected := range []string{"Two", "not installed"} {
		if !strings.Contains(view, expected) {
			t.Fatalf("picker is missing %q:\n%s", expected, view)
		}
	}
}

func TestModelViewRendersHeader(t *testing.T) {
	model := app.NewModel("/tmp/axon", "axon-code", nil)
	updated, _ := model.Update(tea.WindowSizeMsg{Width: 80, Height: 24})
	view := updated.(app.Model).View()

	for _, expected := range []string{"AXON", "axon", "axon-code", "Λ▴", "⌜", "⌞"} {
		if !strings.Contains(view, expected) {
			t.Fatalf("view is missing %q:\n%s", expected, view)
		}
	}
}
