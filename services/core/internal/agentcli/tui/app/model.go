// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"context"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
)

type Model struct {
	workspace string
	modelID   string
	width     int
	height    int
	viewport  viewport.Model
	textarea  textarea.Model
	spinner   spinner.Model
	messages  []components.Message
	streaming bool
	status    string
	events    chan client.Event
	cancel    context.CancelFunc
}

type streamEventMsg struct {
	event client.Event
}

func NewModel(workspace, modelID string) Model {
	input := textarea.New()
	input.Placeholder = "Ask Axon to inspect, change, or explain something..."
	input.Prompt = "› "
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

	spinnerModel := spinner.New()
	spinnerModel.Spinner = spinner.Dot
	spinnerModel.Style = theme.StatusActive

	return Model{
		workspace: workspace,
		modelID:   modelID,
		viewport:  viewportModel,
		textarea:  input,
		spinner:   spinnerModel,
		messages: []components.Message{
			{Role: "assistant", Content: "What are we working on in Axon today?"},
		},
		status: "Ready",
	}
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
