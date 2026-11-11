// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"context"
	"sync"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/pickers"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/transcript"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
	"github.com/GordenArcher/axon-core/internal/ai"
	store "github.com/GordenArcher/axon-core/internal/sessions"
	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
)

type Model struct {
	workspace         string
	modelID           string
	models            []ai.ModelInfo
	sessionID         string
	sessionTitle      string
	sessionSource     string
	sessionCreated    time.Time
	sessions          *store.Store
	persisted         map[string]bool
	sessionPicker     pickers.SessionPicker
	sessionPickerOpen bool
	width             int
	height            int
	viewport          viewport.Model
	textarea          textarea.Model
	spinner           spinner.Model
	renderer          *transcript.Renderer
	messages          []components.Message
	picker            pickers.ModelPicker
	pickerOpen        bool
	streaming         bool
	pulse             int
	status            string
	events            chan client.Event
	cancel            context.CancelFunc
	decisions         chan client.Decision
	approvalOpen      bool
	approval          components.Approval
	approvalID        string
	thoughtPicker     pickers.ThoughtPicker
	thoughtOpen       bool
	commandAllowlist  *sync.Map
}

type streamEventMsg struct {
	event client.Event
}

func NewModel(
	workspace, modelID string,
	models []ai.ModelInfo,
	resume bool,
	sessions *store.Store,
) Model {
	input := textarea.New()
	input.Placeholder = "Ask Axon to inspect, change, or explain something..."
	// The Axon mark is the prompt, not a generic chevron. The first input line
	// carries the mark; continuation lines align under the text.
	input.Prompt = "Λ▴ "
	input.SetPromptFunc(3, func(line int) string {
		if line == 0 {
			return "Λ▴ "
		}
		return "   "
	})
	input.FocusedStyle.Prompt = theme.Prompt
	input.BlurredStyle.Prompt = theme.Prompt
	input.FocusedStyle.Placeholder = theme.Subtle
	input.FocusedStyle.Text = theme.Foreground
	input.CharLimit = 0
	input.ShowLineNumbers = false
	input.SetHeight(3)
	input.SetWidth(80)
	// Enter sends the prompt; Shift+Enter and friends keep the multiline escape
	// hatch users expect from a terminal agent.
	input.KeyMap.InsertNewline = key.NewBinding(
		key.WithKeys("shift+enter", "alt+enter", "ctrl+j"),
		key.WithHelp("shift+enter", "newline"),
	)
	_ = input.Focus()

	viewportModel := viewport.New(80, 20)
	viewportModel.MouseWheelEnabled = true
	viewportModel.MouseWheelDelta = 3

	// The spinner only drives the Axon mark pulse below the input frame. The
	// mark itself is rendered from the model so its three lines stay aligned.
	spinnerModel := spinner.New()
	spinnerModel.Spinner = spinner.Dot
	spinnerModel.Spinner.FPS = time.Second / 6
	spinnerModel.Style = theme.StatusActive

	renderer := transcript.New()
	renderer.SetWorkspace(workspace)

	model := Model{
		workspace:        workspace,
		modelID:          modelID,
		models:           models,
		sessionID:        store.NewID(),
		sessionTitle:     store.DefaultTitle,
		sessionSource:    "cli",
		sessionCreated:   time.Now(),
		sessions:         sessions,
		persisted:        make(map[string]bool),
		commandAllowlist: &sync.Map{},
		viewport:         viewportModel,
		textarea:         input,
		spinner:          spinnerModel,
		renderer:         renderer,
		messages: []components.Message{
			{Role: "assistant", Content: "What are we working on in Axon today?"},
		},
		status: "Ready",
	}

	if sessions != nil && resume {
		summaries, err := sessions.List(workspace)
		if err == nil && len(summaries) > 0 {
			model.sessionPicker = pickers.NewSessionPicker(
				sessionOptions(summaries, model.sessionID),
				model.sessionID,
			)
			model.sessionPickerOpen = true
			model.status = "Select a conversation"
		} else {
			model.status = "No saved conversations"
		}
	}

	return model
}

func (m Model) Init() tea.Cmd {
	return tea.Batch(m.spinner.Tick, m.textarea.Focus())
}

func waitForEvent(events <-chan client.Event) tea.Cmd {
	return func() tea.Msg {
		event, ok := <-events
		if !ok {
			return streamEventMsg{event: client.Event{Kind: client.Done}}
		}
		return streamEventMsg{event: event}
	}
}
