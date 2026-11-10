// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package tests

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/app"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/transcript"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/store"
	"github.com/GordenArcher/axon-core/internal/ai"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/x/ansi"
)

func renderTranscript(messages []components.Message, width int) string {
	renderer := transcript.New()
	renderer.SetWidth(width)
	return renderer.Render(messages, -1)
}

func TestTranscriptRendersMessagesWithoutLabels(t *testing.T) {
	rendered := ansi.Strip(renderTranscript([]components.Message{
		{Role: "user", Content: "hello"},
		{Role: "assistant", Content: "hi there"},
	}, 80))

	for _, expected := range []string{"hello", "hi there"} {
		if !strings.Contains(rendered, expected) {
			t.Fatalf("transcript is missing %q:\n%s", expected, rendered)
		}
	}
	for _, label := range []string{"You", "Axon"} {
		if strings.Contains(rendered, label) {
			t.Fatalf("transcript still renders the %q label:\n%s", label, rendered)
		}
	}
}

func TestTranscriptRendersMarkdownCode(t *testing.T) {
	rendered := ansi.Strip(renderTranscript([]components.Message{
		{
			Role:    "assistant",
			Content: "Here is the call:\n\n```go\nfmt.Println(\"hi\")\n```\n",
		},
	}, 80))

	if !strings.Contains(rendered, "fmt.Println") {
		t.Fatalf("code block is missing its content:\n%s", rendered)
	}
	if !strings.Contains(rendered, "Here is the call") {
		t.Fatalf("markdown text is missing:\n%s", rendered)
	}
}

func TestStreamingCursorOnlyOnActiveMessage(t *testing.T) {
	renderer := transcript.New()
	renderer.SetWidth(80)

	streaming := renderer.Render([]components.Message{
		{Role: "assistant", Content: "partial answer"},
	}, 0)
	if !strings.Contains(streaming, "▍") {
		t.Fatalf("active message is missing the cursor:\n%s", streaming)
	}

	idle := renderer.Render([]components.Message{
		{Role: "assistant", Content: "partial answer"},
	}, -1)
	if strings.Contains(idle, "▍") {
		t.Fatalf("idle message still shows the cursor:\n%s", idle)
	}
}

func TestThinkingCollapses(t *testing.T) {
	expanded := ansi.Strip(renderTranscript([]components.Message{
		{Thinking: true, Content: "plan the change"},
	}, 80))
	if !strings.Contains(expanded, "plan the change") {
		t.Fatalf("expanded thought is missing content:\n%s", expanded)
	}

	collapsed := ansi.Strip(renderTranscript([]components.Message{
		{Thinking: true, Content: "plan the change", Collapsed: true},
	}, 80))
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

func TestSessionPickerMovesAndRenders(t *testing.T) {
	picker := components.NewSessionPicker([]components.SessionOption{
		{ID: "a", Title: "Alpha"},
		{ID: "b", Title: "Beta"},
	}, "a")

	picker.Move(1)
	if picker.SelectedID() != "b" {
		t.Fatalf("expected selection b, got %q", picker.SelectedID())
	}
	if !strings.Contains(picker.View(80, 10), "Beta") {
		t.Fatal("session picker is missing the selected session")
	}
}

func TestStoreRoundTrip(t *testing.T) {
	sessions, err := store.OpenAt(filepath.Join(t.TempDir(), "sessions.db"))
	if err != nil {
		t.Fatalf("open session store: %v", err)
	}
	t.Cleanup(func() {
		if err := sessions.Close(); err != nil {
			t.Fatalf("close session store: %v", err)
		}
	})

	if err := sessions.UpsertSession(store.Session{
		ID:        "s1",
		Workspace: "/tmp/axon",
		Title:     "Test conversation",
		Model:     "axon-code",
		CreatedAt: time.Now(),
	}); err != nil {
		t.Fatalf("upsert session: %v", err)
	}

	if err := sessions.AppendMessages("s1", []store.Message{
		{ID: "m1", Role: "user", Content: "hello"},
		{ID: "m2", Role: "assistant", Content: "hi"},
	}); err != nil {
		t.Fatalf("append messages: %v", err)
	}
	// A second turn must land after the first, not replace it.
	if err := sessions.AppendMessages("s1", []store.Message{
		{ID: "m3", Role: "user", Content: "again"},
	}); err != nil {
		t.Fatalf("append second turn: %v", err)
	}

	summaries, err := sessions.List("/tmp/axon")
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if len(summaries) != 1 || summaries[0].ID != "s1" {
		t.Fatalf("unexpected sessions: %#v", summaries)
	}

	loaded, err := sessions.LoadSession("s1")
	if err != nil {
		t.Fatalf("load session: %v", err)
	}
	if loaded.Title != "Test conversation" {
		t.Fatalf("unexpected title: %q", loaded.Title)
	}
	if len(loaded.Messages) != 3 {
		t.Fatalf("expected 3 messages, got %#v", loaded.Messages)
	}
	wantOrder := []string{"hello", "hi", "again"}
	for index, want := range wantOrder {
		if loaded.Messages[index].Content != want {
			t.Fatalf("message %d is %q, want %q", index, loaded.Messages[index].Content, want)
		}
	}
}

func TestModelViewRendersHeader(t *testing.T) {
	model := app.NewModel("/tmp/axon", "axon-code", nil, false, nil)
	updated, _ := model.Update(tea.WindowSizeMsg{Width: 80, Height: 24})
	view := updated.(app.Model).View()

	for _, expected := range []string{"AXON", "axon", "axon-code", "Λ▴", "⌜", "⌞"} {
		if !strings.Contains(view, expected) {
			t.Fatalf("view is missing %q:\n%s", expected, view)
		}
	}
}
