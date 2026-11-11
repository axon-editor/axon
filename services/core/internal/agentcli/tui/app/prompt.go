// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client/agent"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/pickers"
	store "github.com/GordenArcher/axon-core/internal/sessions"
	tea "github.com/charmbracelet/bubbletea"
)

func (m Model) sendPrompt(value string) (tea.Model, tea.Cmd) {
	prompt := strings.TrimSpace(value)
	if prompt == "" {
		return m, nil
	}
	if strings.HasPrefix(prompt, "/") {
		return m.handleSlash(prompt)
	}

	history := modelHistory(m.messages)
	m.messages = append(m.messages, components.Message{
		ID:      store.NewID(),
		Role:    "user",
		Content: prompt,
	})
	if m.sessionTitle == "" || m.sessionTitle == store.DefaultTitle {
		m.sessionTitle = store.Title(prompt)
	}
	m.textarea.Reset()
	m.streaming = true
	m.pulse = 0
	m.status = "Thinking..."

	events := make(chan client.Event, 64)
	decisions := make(chan client.Decision, 1)
	ctx, cancel := context.WithCancel(context.Background())
	allowlist := m.commandAllowlist
	if allowlist == nil {
		allowlist = &sync.Map{}
		m.commandAllowlist = allowlist
	}
	m.events = events
	m.decisions = decisions
	m.cancel = cancel
	m.approvalOpen = false
	m.approval = components.Approval{}
	m.approvalID = ""
	m.updateTranscript()
	// Persist the question before the model answers. If the process dies
	// mid-stream the user can still resume and see what was asked.
	m.saveSession()

	go agent.Run(ctx, client.Request{
		Prompt:     prompt,
		FolderPath: m.workspace,
		Model:      m.modelID,
		History:    history,
		Decisions:  decisions,
		CommandAllowed: func(command string) bool {
			_, ok := allowlist.Load(command)
			return ok
		},
		AllowCommand: func(command string) {
			allowlist.Store(command, true)
		},
	}, events)

	return m, tea.Batch(waitForEvent(events), m.spinner.Tick)
}

func (m Model) handleSlash(prompt string) (tea.Model, tea.Cmd) {
	m.textarea.Reset()
	switch strings.ToLower(prompt) {
	case "/quit", "/exit":
		return m, tea.Quit
	case "/clear":
		// Clearing starts a new database row instead of only emptying the
		// viewport. The previous conversation stays resumable, and the next
		// prompt cannot append to a transcript the user just abandoned.
		m.messages = nil
		m.sessionID = store.NewID()
		m.sessionTitle = store.DefaultTitle
		m.sessionSource = "cli"
		m.sessionCreated = time.Now()
		m.persisted = make(map[string]bool)
		m.approvalOpen = false
		m.approval = components.Approval{}
		m.approvalID = ""
		m.decisions = nil
		m.status = "Ready"
	case "/model":
		if len(m.models) == 0 {
			m.messages = append(m.messages, components.Message{
				Role:    "assistant",
				Content: "No models reported by the runtime.",
			})
		} else {
			m.picker = pickers.NewModelPicker(m.models, m.modelID)
			m.pickerOpen = true
			m.status = "Select a model"
		}
	case "/resume", "/sessions":
		if m.sessions == nil {
			m.messages = append(m.messages, components.Message{
				Role:    "assistant",
				Content: "Session storage is unavailable.",
			})
			break
		}
		summaries, err := m.sessions.List(m.workspace)
		if err != nil || len(summaries) == 0 {
			m.messages = append(m.messages, components.Message{
				Role:    "assistant",
				Content: "No saved conversations for this workspace.",
			})
		} else {
			m.sessionPicker = pickers.NewSessionPicker(
				sessionOptions(summaries, m.sessionID),
				m.sessionID,
			)
			m.sessionPickerOpen = true
			m.status = "Select a conversation"
		}
	case "/help":
		m.messages = append(m.messages, components.Message{
			Role: "assistant",
			Content: strings.Join([]string{
				"Commands:",
				"/clear    clear the transcript",
				"/model    choose a model",
				"/resume   resume a saved conversation",
				"/help     show this list",
				"/quit     exit Axon",
				"",
				"Keys: Enter send, Shift+Enter newline, Esc cancel, Ctrl+T thought, Ctrl+O tool output, Ctrl+C quit.",
			}, "\n"),
		})
	default:
		m.messages = append(m.messages, components.Message{
			Role:    "assistant",
			Content: "Unknown command. Try /help.",
		})
	}
	m.updateTranscript()
	return m, nil
}
