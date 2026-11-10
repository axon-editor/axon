// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"context"
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	"github.com/GordenArcher/axon-core/internal/ai"
	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
)

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.layout()
		return m, nil

	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			if m.cancel != nil {
				m.cancel()
			}
			return m, tea.Quit
		case "esc":
			if m.streaming && m.cancel != nil {
				m.cancel()
				m.status = "Cancelling..."
			} else {
				m.textarea.Reset()
			}
			return m, nil
		case "enter":
			if m.streaming {
				return m, nil
			}
			return m.sendPrompt(m.textarea.Value())
		case "pgup":
			m.viewport.ViewUp()
			return m, nil
		case "pgdown":
			m.viewport.ViewDown()
			return m, nil
		}

		var command tea.Cmd
		m.textarea, command = m.textarea.Update(msg)
		return m, command

	case tea.MouseMsg:
		if msg.Button == tea.MouseButtonWheelUp {
			m.viewport.ScrollUp(m.viewport.MouseWheelDelta)
		}
		if msg.Button == tea.MouseButtonWheelDown {
			m.viewport.ScrollDown(m.viewport.MouseWheelDelta)
		}
		return m, nil

	case streamEventMsg:
		return m.handleStreamEvent(msg.event)

	case spinner.TickMsg:
		var command tea.Cmd
		m.spinner, command = m.spinner.Update(msg)
		return m, command
	}

	return m, nil
}

func (m Model) handleStreamEvent(event client.Event) (tea.Model, tea.Cmd) {
	switch event.Kind {
	case client.Status:
		m.status = event.Text
	case client.Delta:
		m.appendAssistantDelta(event.Text)
		m.updateTranscript()
	case client.Done:
		m.streaming = false
		m.status = "Ready"
		m.cancel = nil
		m.events = nil
		return m, nil
	case client.Cancelled:
		m.streaming = false
		m.status = "Cancelled"
		m.cancel = nil
		m.events = nil
		return m, nil
	case client.Error:
		m.streaming = false
		m.status = "Error"
		m.appendAssistantError(event.Text)
		m.cancel = nil
		m.events = nil
		m.updateTranscript()
		return m, nil
	}

	if m.streaming && m.events != nil {
		return m, waitForEvent(m.events)
	}
	return m, nil
}

func (m *Model) appendAssistantDelta(delta string) {
	if len(m.messages) == 0 ||
		m.messages[len(m.messages)-1].Role != "assistant" {
		m.messages = append(m.messages, components.Message{Role: "assistant"})
	}
	last := len(m.messages) - 1
	m.messages[last].Content += delta
}

func (m *Model) appendAssistantError(message string) {
	if len(m.messages) == 0 ||
		m.messages[len(m.messages)-1].Role != "assistant" ||
		m.messages[len(m.messages)-1].Content == "" {
		m.messages = append(m.messages, components.Message{
			Role:    "assistant",
			Content: "Error: " + message,
		})
		return
	}
	last := len(m.messages) - 1
	m.messages[last].Content += "\n\nError: " + message
}

func (m Model) sendPrompt(value string) (tea.Model, tea.Cmd) {
	prompt := strings.TrimSpace(value)
	if prompt == "" {
		return m, nil
	}
	if strings.HasPrefix(prompt, "/") {
		return m.handleSlash(prompt)
	}

	history := conversationHistory(m.messages)
	m.messages = append(m.messages, components.Message{
		Role:    "user",
		Content: prompt,
	})
	m.messages = append(m.messages, components.Message{Role: "assistant"})
	m.textarea.Reset()
	m.streaming = true
	m.status = "Thinking..."

	events := make(chan client.Event, 64)
	ctx, cancel := context.WithCancel(context.Background())
	m.events = events
	m.cancel = cancel
	m.layout()
	m.updateTranscript()

	go client.Stream(ctx, client.Request{
		Prompt:       prompt,
		FolderPath:   m.workspace,
		Model:        m.modelID,
		Conversation: history,
	}, events)

	return m, tea.Batch(waitForEvent(events), m.spinner.Tick)
}

func (m Model) handleSlash(prompt string) (tea.Model, tea.Cmd) {
	m.textarea.Reset()
	switch strings.ToLower(prompt) {
	case "/quit", "/exit":
		return m, tea.Quit
	case "/clear":
		m.messages = nil
		m.status = "Ready"
	case "/model":
		m.messages = append(m.messages, components.Message{
			Role:    "assistant",
			Content: "Model: " + m.modelID,
		})
	case "/help":
		m.messages = append(m.messages, components.Message{
			Role: "assistant",
			Content: strings.Join([]string{
				"Commands:",
				"/clear   clear the transcript",
				"/model   show the selected model",
				"/help    show this list",
				"/quit    exit Axon",
				"",
				"Keys: Enter send, Shift+Enter newline, Esc cancel, Ctrl+C quit.",
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

func conversationHistory(messages []components.Message) []ai.ConversationMessage {
	started := false
	history := make([]ai.ConversationMessage, 0, len(messages))
	for _, message := range messages {
		if message.Role == "user" {
			started = true
		}
		if !started || message.Content == "" {
			continue
		}
		history = append(history, ai.ConversationMessage{
			Role:    message.Role,
			Content: message.Content,
		})
	}
	return history
}
