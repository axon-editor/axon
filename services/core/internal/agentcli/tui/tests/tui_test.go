// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package tests

import (
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/app"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/pickers"
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
	picker := pickers.NewModelPicker([]ai.ModelInfo{
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

func TestToolCardRendersNameArgumentsAndPreview(t *testing.T) {
	rendered := ansi.Strip(renderTranscript([]components.Message{
		{
			ID:   "tool-1",
			Role: "tool",
			Tool: &components.Tool{
				CallID:     "call-1",
				Name:       "read_file",
				Arguments:  `{"path":"internal/ai/ai.go","offset":40,"limit":20}`,
				Result:     "package ai\n\nfunc StreamChat()",
				OK:         true,
				Approval:   "session",
				DurationMS: 12,
			},
		},
	}, 80))

	for _, expected := range []string{
		"read_file",
		"internal/ai/ai.go",
		"from 40",
		"20 lines",
		"12ms",
		"allowed for session",
		"package ai",
		"func StreamChat",
	} {
		if !strings.Contains(rendered, expected) {
			t.Fatalf("tool card is missing %q:\n%s", expected, rendered)
		}
	}
	if strings.Contains(rendered, "You") || strings.Contains(rendered, "Axon") {
		t.Fatalf("tool card rendered a role label:\n%s", rendered)
	}
}

func TestToolCardShowsFailure(t *testing.T) {
	rendered := ansi.Strip(renderTranscript([]components.Message{
		{
			ID:   "tool-2",
			Role: "tool",
			Tool: &components.Tool{
				CallID: "call-2",
				Name:   "grep",
				Result: "grep failed: invalid arguments.",
				OK:     false,
			},
		},
	}, 80))
	if !strings.Contains(rendered, "✗") || !strings.Contains(rendered, "failed") {
		t.Fatalf("failed tool card is missing its state:\n%s", rendered)
	}
}

func TestWaitingToolCard(t *testing.T) {
	rendered := ansi.Strip(renderTranscript([]components.Message{
		{
			ID:   "tool-4",
			Role: "tool",
			Tool: &components.Tool{
				CallID:    "call-4",
				Name:      "run_command",
				Arguments: `{"command":"go test ./..."}`,
				Waiting:   true,
			},
		},
	}, 80))
	if !strings.Contains(rendered, "?") || !strings.Contains(rendered, "waiting for approval") {
		t.Fatalf("waiting tool card is missing its state:\n%s", rendered)
	}
}

func TestDeniedToolCard(t *testing.T) {
	rendered := ansi.Strip(renderTranscript([]components.Message{
		{
			ID:   "tool-5",
			Role: "tool",
			Tool: &components.Tool{
				CallID:   "call-5",
				Name:     "run_command",
				Result:   "The user declined to run run_command.",
				Approval: "denied",
			},
		},
	}, 80))
	if !strings.Contains(rendered, "✗") || !strings.Contains(rendered, "denied") {
		t.Fatalf("denied tool card is missing its state:\n%s", rendered)
	}
}

func TestApprovalViewShowsCommand(t *testing.T) {
	rendered := ansi.Strip(components.Approval{
		ToolName:     "run_command",
		Summary:      "go test ./...",
		Details:      "Run the test suite\n\n$ go test ./...",
		AllowSession: true,
	}.View(80, 20))

	for _, expected := range []string{
		"Approval required",
		"run_command",
		"go test ./...",
		"Run the test suite",
		"allow for this session",
	} {
		if !strings.Contains(rendered, expected) {
			t.Fatalf("approval view is missing %q:\n%s", expected, rendered)
		}
	}
}

func TestToolOutputExpands(t *testing.T) {
	lines := make([]string, 0, 8)
	for index := 1; index <= 8; index++ {
		lines = append(lines, fmt.Sprintf("line-%02d", index))
	}
	result := strings.Join(lines, "\n")

	collapsed := ansi.Strip(renderTranscript([]components.Message{
		{ID: "tool-6", Role: "tool", Tool: &components.Tool{Name: "read_file", Result: result}},
	}, 80))
	if !strings.Contains(collapsed, "line-01") {
		t.Fatalf("collapsed card is missing the preview:\n%s", collapsed)
	}
	if strings.Contains(collapsed, "line-08") {
		t.Fatalf("collapsed card leaked the full output:\n%s", collapsed)
	}
	if !strings.Contains(collapsed, "ctrl+o") {
		t.Fatalf("collapsed card is missing the expand hint:\n%s", collapsed)
	}

	expanded := ansi.Strip(renderTranscript([]components.Message{
		{
			ID:   "tool-6",
			Role: "tool",
			Tool: &components.Tool{Name: "read_file", Result: result, Expanded: true},
		},
	}, 80))
	if !strings.Contains(expanded, "line-08") {
		t.Fatalf("expanded card is missing the tail:\n%s", expanded)
	}
}

func TestRunningToolCard(t *testing.T) {
	rendered := ansi.Strip(renderTranscript([]components.Message{
		{
			ID:   "tool-3",
			Role: "tool",
			Tool: &components.Tool{
				CallID:  "call-3",
				Name:    "list_files",
				Running: true,
			},
		},
	}, 80))
	if !strings.Contains(rendered, "▸") || !strings.Contains(rendered, "running") {
		t.Fatalf("running tool card is missing its state:\n%s", rendered)
	}
}

func TestSessionPickerMovesAndRenders(t *testing.T) {
	picker := pickers.NewSessionPicker([]pickers.SessionOption{
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
	// A second turn must land after the first, not replace it. The tool row
	// shares the same ordered transcript as text rows.
	if err := sessions.AppendMessages("s1", []store.Message{
		{ID: "m3", Role: "user", Content: "again"},
		{ID: "m4", Role: "tool", Kind: "tool", Data: `{"callId":"c1","name":"read_file"}`},
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
	if len(loaded.Messages) != 4 {
		t.Fatalf("expected 4 messages, got %#v", loaded.Messages)
	}
	wantOrder := []string{"hello", "hi", "again"}
	for index, want := range wantOrder {
		if loaded.Messages[index].Content != want {
			t.Fatalf("message %d is %q, want %q", index, loaded.Messages[index].Content, want)
		}
	}
	toolRow := loaded.Messages[3]
	if toolRow.Kind != "tool" || !strings.Contains(toolRow.Data, "read_file") {
		t.Fatalf("tool row did not round-trip: %#v", toolRow)
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
