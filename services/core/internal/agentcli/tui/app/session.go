// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/store"
)

func (m *Model) loadSession(id string) {
	if m.sessions == nil {
		return
	}
	record, err := m.sessions.LoadSession(id)
	if err != nil {
		m.status = "Could not load conversation"
		return
	}
	m.sessionID = record.ID
	m.sessionTitle = record.Title
	m.sessionCreated = record.CreatedAt
	m.messages = transcriptMessages(record.Messages)
	m.persisted = make(map[string]bool, len(record.Messages))
	for _, message := range record.Messages {
		if message.ID != "" {
			m.persisted[message.ID] = true
		}
	}
	if record.Model != "" {
		m.modelID = record.Model
	}
	m.status = "Ready"
	m.updateTranscript()
}

// saveSession writes the header first so the message foreign key always
// resolves, then appends only unseen rows. Re-appending a message that is
// already stored would consume a new sequence number and push it to the bottom
// of the transcript after a resume.
func (m *Model) saveSession() {
	if m.sessions == nil {
		return
	}
	messages := persistedMessages(m.messages)
	if len(messages) == 0 {
		return
	}
	m.sessionTitle = sessionTitle(m.messages, m.sessionTitle)

	if err := m.sessions.UpsertSession(store.Session{
		ID:        m.sessionID,
		Workspace: m.workspace,
		Title:     m.sessionTitle,
		Model:     m.modelID,
		CreatedAt: m.sessionCreated,
	}); err != nil {
		m.status = "Could not save conversation"
		return
	}

	pending := make([]store.Message, 0, len(messages))
	for _, message := range messages {
		if m.persisted[message.ID] {
			continue
		}
		pending = append(pending, message)
	}
	if len(pending) == 0 {
		return
	}
	if err := m.sessions.AppendMessages(m.sessionID, pending); err != nil {
		m.status = "Could not save conversation"
		return
	}
	for _, message := range pending {
		m.persisted[message.ID] = true
	}
}

func sessionOptions(
	sessions []store.Summary,
	currentID string,
) []components.SessionOption {
	options := make([]components.SessionOption, 0, len(sessions))
	for _, session := range sessions {
		options = append(options, components.SessionOption{
			ID:      session.ID,
			Title:   session.Title,
			Model:   session.Model,
			Updated: session.UpdatedAt.Local().Format("Jan 2 15:04"),
			Current: session.ID == currentID,
		})
	}
	return options
}
