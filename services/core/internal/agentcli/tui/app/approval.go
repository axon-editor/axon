// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/store"
	tea "github.com/charmbracelet/bubbletea"
)

func (m Model) updateApproval(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	decision := client.Decision{ID: m.approvalID}
	switch msg.String() {
	case "y", "enter":
		decision.Approved = true
	case "a":
		if !m.approval.AllowSession {
			return m, nil
		}
		decision.Approved = true
		decision.AllowSession = true
	case "n", "esc":
		decision.Approved = false
	default:
		return m, nil
	}

	m.sendDecision(decision)
	m.approvalOpen = false
	m.markApproval(decision)
	if decision.Approved {
		m.status = "Running..."
	} else {
		m.status = "Denied"
	}
	m.updateTranscript()
	return m, nil
}

func (m *Model) openApproval(event client.Event) {
	m.approval = components.Approval{
		ToolName:     event.ToolName,
		Summary:      event.Summary,
		Details:      event.Details,
		AllowSession: event.AllowSession,
	}
	m.approvalID = event.ToolCallID
	m.approvalOpen = true
	m.status = "Waiting for approval"

	m.messages = append(m.messages, components.Message{
		ID:   store.NewID(),
		Role: "tool",
		Tool: &components.Tool{
			CallID:    event.ToolCallID,
			Name:      event.ToolName,
			Arguments: event.Arguments,
			Waiting:   true,
		},
	})
}

// sendDecision is deliberately non-blocking. The agent is waiting on the
// channel, so the buffer is empty in normal use; a stale decision must not
// freeze the TUI if the run was cancelled at the same moment.
func (m *Model) sendDecision(decision client.Decision) {
	if m.decisions == nil {
		return
	}
	select {
	case m.decisions <- decision:
	default:
	}
}

func (m *Model) markApproval(decision client.Decision) {
	tool := m.toolByCallID(decision.ID)
	if tool == nil {
		return
	}
	tool.Waiting = false
	if decision.Approved {
		tool.Running = true
		tool.Approval = "once"
		if decision.AllowSession {
			tool.Approval = "session"
		}
		return
	}
	tool.Running = false
	tool.OK = false
	tool.Approval = "denied"
	tool.Result = "The user declined to run " + tool.Name + "."
}

func (m Model) toolByCallID(callID string) *components.Tool {
	for index := len(m.messages) - 1; index >= 0; index-- {
		tool := m.messages[index].Tool
		if tool != nil && tool.CallID == callID {
			return tool
		}
	}
	return nil
}
