// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/store"
	tea "github.com/charmbracelet/bubbletea"
)

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
		m.finishStream("Ready")
		return m, nil
	case client.Cancelled:
		m.finishStream("Cancelled")
		return m, nil
	case client.Error:
		m.appendAssistantError(event.Text)
		m.finishStream("Error")
		return m, nil
	}

	if m.streaming && m.events != nil {
		return m, waitForEvent(m.events)
	}
	return m, nil
}

// finishStream collapses the live thought block and persists the turn before
// clearing the channel. Saving here is what makes cancel and error paths
// resumable instead of leaving a half-written conversation in memory only.
func (m *Model) finishStream(status string) {
	m.collapseThinking()
	m.updateTranscript()
	m.streaming = false
	m.status = status
	m.cancel = nil
	m.events = nil
	m.saveSession()
}

func (m *Model) appendThought(text string) {
	if text == "" {
		return
	}
	last := len(m.messages) - 1
	if last < 0 || !m.messages[last].Thinking || m.messages[last].Collapsed {
		m.messages = append(m.messages, components.Message{
			ID:       store.NewID(),
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
		m.messages = append(m.messages, components.Message{
			ID:   store.NewID(),
			Role: "assistant",
		})
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
			ID:      store.NewID(),
			Role:    "assistant",
			Content: "Error: " + message,
		})
		return
	}
	m.messages[last].Content += "\n\nError: " + message
}
