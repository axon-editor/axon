// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"context"
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/configstore"
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
		if msg.String() == "ctrl+c" {
			if m.cancel != nil {
				m.cancel()
			}
			return m, tea.Quit
		}
		if m.pickerOpen {
			return m.updatePicker(msg)
		}

		switch msg.String() {
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
		case "ctrl+t":
			m.toggleThinking()
			m.updateTranscript()
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
		if m.streaming {
			m.pulse++
		}
		var command tea.Cmd
		m.spinner, command = m.spinner.Update(msg)
		return m, command
	}

	return m, nil
}

func (m Model) updatePicker(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc":
		m.pickerOpen = false
		m.status = "Ready"
	case "up", "k":
		m.picker.Move(-1)
	case "down", "j":
		m.picker.Move(1)
	case "enter":
		if id := m.picker.SelectedID(); id != "" {
			if !m.picker.SelectedAvailable() {
				m.status = "Model is not installed"
				return m, nil
			}
			m.modelID = id
			_ = configstore.Save(configstore.Config{SelectedModel: id})
		}
		m.status = "Ready"
		m.pickerOpen = false
	}
	return m, nil
}

func (m Model) handleStreamEvent(event client.Event) (tea.Model, tea.Cmd) {
	switch event.Kind {
	case client.Status:
		m.status = event.Text
	case client.Thought:
		m.appendThought(event.Text)
		m.updateTranscript()
	case client.Delta:
		m.collapseThinking()
		m.appendAssistantDelta(event.Text)
		m.updateTranscript()
	case client.Done:
		m.collapseThinking()
		m.updateTranscript()
		m.streaming = false
		m.status = "Ready"
		m.cancel = nil
		m.events = nil
		return m, nil
	case client.Cancelled:
		m.collapseThinking()
		m.updateTranscript()
		m.streaming = false
		m.status = "Cancelled"
		m.cancel = nil
		m.events = nil
		return m, nil
	case client.Error:
		m.collapseThinking()
		m.appendAssistantError(event.Text)
		m.updateTranscript()
		m.streaming = false
		m.status = "Error"
		m.cancel = nil
		m.events = nil
		return m, nil
	}

	if m.streaming && m.events != nil {
		return m, waitForEvent(m.events)
	}
	return m, nil
}

func (m *Model) appendThought(text string) {
	if text == "" {
		return
	}
	last := len(m.messages) - 1
	if last < 0 || !m.messages[last].Thinking || m.messages[last].Collapsed {
		m.messages = append(m.messages, components.Message{
			Thinking: true,
			Content:  text,
		})
		return
	}
	m.messages[last].Content += text
}

func (m *Model) collapseThinking() {
	for index := len(m.messages) - 1; index >= 0; index-- {
		if m.messages[index].Thinking {
			m.messages[index].Collapsed = true
			return
		}
	}
}

func (m *Model) toggleThinking() {
	for index := len(m.messages) - 1; index >= 0; index-- {
		if m.messages[index].Thinking {
			m.messages[index].Collapsed = !m.messages[index].Collapsed
			return
		}
	}
}

func (m *Model) appendAssistantDelta(delta string) {
	last := len(m.messages) - 1
	if last < 0 ||
		m.messages[last].Thinking ||
		m.messages[last].Role != "assistant" {
		m.messages = append(m.messages, components.Message{Role: "assistant"})
		last = len(m.messages) - 1
	}
	m.messages[last].Content += delta
}

func (m *Model) appendAssistantError(message string) {
	last := len(m.messages) - 1
	if last < 0 ||
		m.messages[last].Thinking ||
		m.messages[last].Role != "assistant" ||
		m.messages[last].Content == "" {
		m.messages = append(m.messages, components.Message{
			Role:    "assistant",
			Content: "Error: " + message,
		})
		return
	}
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
	m.textarea.Reset()
	m.streaming = true
	m.pulse = 0
	m.status = "Thinking..."

	events := make(chan client.Event, 64)
	ctx, cancel := context.WithCancel(context.Background())
	m.events = events
	m.cancel = cancel
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
		if len(m.models) == 0 {
			m.messages = append(m.messages, components.Message{
				Role:    "assistant",
				Content: "No models reported by the runtime.",
			})
		} else {
			m.picker = components.NewModelPicker(m.models, m.modelID)
			m.pickerOpen = true
			m.status = "Select a model"
		}
	case "/help":
		m.messages = append(m.messages, components.Message{
			Role: "assistant",
			Content: strings.Join([]string{
				"Commands:",
				"/clear   clear the transcript",
				"/model   choose a model",
				"/help    show this list",
				"/quit    exit Axon",
				"",
				"Keys: Enter send, Shift+Enter newline, Esc cancel, Ctrl+T thought, Ctrl+C quit.",
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
		if !started || message.Content == "" || message.Thinking {
			continue
		}
		history = append(history, ai.ConversationMessage{
			Role:    message.Role,
			Content: message.Content,
		})
	}
	return history
}
