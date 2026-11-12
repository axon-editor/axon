// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package tests

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/app"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
	store "github.com/GordenArcher/axon-core/internal/sessions"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/x/ansi"
)

func sizedModel(t *testing.T, resume bool, sessions *store.Store) app.Model {
	t.Helper()
	model := app.NewModel("/tmp/axon", "axon-code", nil, resume, sessions)
	updated, _ := model.Update(tea.WindowSizeMsg{Width: 100, Height: 30})
	return updated.(app.Model)
}

func press(model app.Model, key tea.KeyType) (app.Model, tea.Cmd) {
	updated, command := model.Update(tea.KeyMsg{Type: key})
	return updated.(app.Model), command
}

func pressRune(model app.Model, value rune) app.Model {
	updated, _ := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{value}})
	return updated.(app.Model)
}

func typeText(model app.Model, text string) app.Model {
	for _, character := range text {
		updated, _ := model.Update(tea.KeyMsg{
			Type:  tea.KeyRunes,
			Runes: []rune{character},
		})
		model = updated.(app.Model)
	}
	return model
}

func TestSelectionModeTogglesMouseCapture(t *testing.T) {
	model := sizedModel(t, false, nil)

	model, command := press(model, tea.KeyCtrlY)
	if command == nil {
		t.Fatal("Ctrl+Y did not issue a mouse command")
	}
	if !strings.Contains(model.View(), "Selection mode") {
		t.Fatalf("selection mode missing from view:\n%s", model.View())
	}

	model, command = press(model, tea.KeyCtrlY)
	if command == nil {
		t.Fatal("leaving selection mode did not issue a mouse command")
	}
	if strings.Contains(model.View(), "Selection mode") {
		t.Fatalf("selection mode survived the second toggle:\n%s", model.View())
	}
}

func TestApprovalOverlayClosesOnDeny(t *testing.T) {
	model := sizedModel(t, false, nil)
	updated, _ := model.HandleStreamEvent(client.Event{
		Kind:       client.ApprovalRequest,
		ToolCallID: "call-1",
		ToolName:   "run_command",
		Arguments:  `{"command":"rm -rf build"}`,
		Summary:    "rm -rf build",
		Details:    "Remove the build folder",
	})
	model = updated.(app.Model)

	if !strings.Contains(ansi.Strip(model.View()), "Approval required") {
		t.Fatalf("approval overlay did not open:\n%s", model.View())
	}

	model = pressRune(model, 'n')
	if strings.Contains(ansi.Strip(model.View()), "Approval required") {
		t.Fatalf("approval overlay stayed open:\n%s", model.View())
	}
}

func TestSlashStatusAndNewSession(t *testing.T) {
	model := sizedModel(t, false, nil)
	model = typeText(model, "/status")
	model, _ = press(model, tea.KeyEnter)
	view := ansi.Strip(model.View())
	if !strings.Contains(view, "Model: axon-code") ||
		!strings.Contains(view, "Workspace:") ||
		!strings.Contains(view, "/tmp/axon") {
		t.Fatalf("status command output missing:\n%s", view)
	}

	model = typeText(model, "/new")
	model, _ = press(model, tea.KeyEnter)
	if strings.Contains(ansi.Strip(model.View()), "Model: axon-code") {
		t.Fatalf("/new did not clear the transcript:\n%s", model.View())
	}
}

func TestComposerHintsAreRightAligned(t *testing.T) {
	model := sizedModel(t, false, nil)
	for _, line := range strings.Split(ansi.Strip(model.View()), "\n") {
		if !strings.Contains(line, "enter send") {
			continue
		}
		if !strings.HasPrefix(line, " ") {
			t.Fatalf("hints are not right-aligned: %q", line)
		}
		if strings.TrimRight(line, " ") != line {
			t.Fatalf("hints have trailing whitespace: %q", line)
		}
		return
	}
	t.Fatal("composer hints are missing from the view")
}

func TestStatusSitsBetweenTranscriptAndComposer(t *testing.T) {
	model := sizedModel(t, false, nil)
	view := ansi.Strip(model.View())
	transcriptIndex := strings.Index(view, "What are we working on")
	statusIndex := strings.Index(view, "Ready")
	composerIndex := strings.Index(view, "Ask Axon...")
	if transcriptIndex < 0 || statusIndex < 0 || composerIndex < 0 {
		t.Fatalf("transcript, status, or composer missing:\n%s", view)
	}
	if statusIndex < transcriptIndex || statusIndex > composerIndex {
		t.Fatalf("status should sit between transcript and composer:\n%s", view)
	}
}

func TestSessionPickerHidesComposer(t *testing.T) {
	sessions, err := store.OpenAt(filepath.Join(t.TempDir(), "sessions.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() {
		_ = sessions.Close()
	})
	if err := sessions.UpsertSession(store.Session{
		ID:        "s1",
		Workspace: "/tmp/axon",
		Title:     "Saved conversation",
		CreatedAt: time.Now(),
	}); err != nil {
		t.Fatalf("upsert session: %v", err)
	}

	model := sizedModel(t, true, sessions)
	view := ansi.Strip(model.View())
	for _, forbidden := range []string{"Ask Axon...", "╭", "╰", "enter send"} {
		if strings.Contains(view, forbidden) {
			t.Fatalf("session picker still renders the composer %q:\n%s", forbidden, view)
		}
	}
	if !strings.Contains(view, "Saved conversation") {
		t.Fatalf("session picker is missing its list:\n%s", view)
	}
}
