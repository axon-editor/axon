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
	case client.ApprovalRequest:
		m.openApproval(event)
		m.updateTranscript()
	case client.ToolStart:
		m.appendTool(event)
		m.status = "Running " + event.ToolName + "..."
		m.updateTranscript()
	case client.ToolResult:
		m.finishTool(event)
		m.status = "Thinking..."
		m.updateTranscript()
		// Persist each completed tool card immediately. A long tool loop can
		// span many seconds, and a crash should not erase the work already done.
		m.saveSession()
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
	m.decisions = nil
	m.approvalOpen = false
	m.approval = components.Approval{}
	m.approvalID = ""
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
			Role:     "assistant",
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

// toggleToolOutput expands or collapses the most recent tool card. It uses the
// card order rather than a per-card key so the shortcut works without moving
// focus into the transcript.
func (m *Model) toggleToolOutput() {
	for index := len(m.messages) - 1; index >= 0; index-- {
		tool := m.messages[index].Tool
		if tool != nil {
			tool.Expanded = !tool.Expanded
			return
		}
	}
}

func (m *Model) appendTool(event client.Event) {
	// A mutating tool already has a waiting card from the approval request.
	// Move that card to running instead of adding a duplicate.
	for index := len(m.messages) - 1; index >= 0; index-- {
		tool := m.messages[index].Tool
		if tool == nil || tool.CallID != event.ToolCallID {
			continue
		}
		tool.Running = true
		tool.Waiting = false
		if event.Approval != "" {
			tool.Approval = event.Approval
		}
		if tool.Name == "" {
			tool.Name = event.ToolName
		}
		if tool.Arguments == "" {
			tool.Arguments = event.Arguments
		}
		return
	}

	m.messages = append(m.messages, components.Message{
		ID:   store.NewID(),
		Role: "tool",
		Tool: &components.Tool{
			CallID:    event.ToolCallID,
			Name:      event.ToolName,
			Arguments: event.Arguments,
			Running:   true,
			Approval:  event.Approval,
		},
	})
}

func (m *Model) finishTool(event client.Event) {
	for index := len(m.messages) - 1; index >= 0; index-- {
		tool := m.messages[index].Tool
		if tool == nil || tool.CallID != event.ToolCallID {
			continue
		}
		tool.Result = event.Result
		tool.OK = event.OK
		tool.Running = false
		tool.Waiting = false
		tool.DurationMS = event.DurationMS
		if event.Approval != "" {
			tool.Approval = event.Approval
		}
		if tool.Name == "" {
			tool.Name = event.ToolName
		}
		return
	}

	// A result without a start can happen when a stream attaches mid-turn or an
	// older core only sent the completion. Showing the card is still better than
	// dropping evidence that the agent touched the workspace.
	m.messages = append(m.messages, components.Message{
		ID:   store.NewID(),
		Role: "tool",
		Tool: &components.Tool{
			CallID:     event.ToolCallID,
			Name:       event.ToolName,
			Result:     event.Result,
			OK:         event.OK,
			Approval:   event.Approval,
			DurationMS: event.DurationMS,
		},
	})
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
