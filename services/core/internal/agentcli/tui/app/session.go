// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	sessionpicker "github.com/GordenArcher/axon-core/internal/agentcli/tui/components/pickers/session"
	store "github.com/GordenArcher/axon-core/internal/sessions"
	"github.com/GordenArcher/axon-core/internal/sessions/payload"
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
	m.sessionSource = record.Source
	if m.sessionSource == "" {
		m.sessionSource = "cli"
	}

	// Editor conversations and payload-only sessions decode their timeline.
	// CLI conversations keep using the normalized rows because the editor may
	// truncate a payload when it normalizes an unfamiliar transcript.
	switch {
	case m.sessionSource == "editor":
		m.messages = decodePayload(record.Payload, record.Messages)
	case len(record.Messages) > 0:
		m.messages = transcriptMessages(record.Messages)
	case record.Payload != "":
		m.messages = decodePayload(record.Payload, record.Messages)
	default:
		m.messages = transcriptMessages(record.Messages)
	}

	// Mark both views as persisted. The decoded payload gets new row ids, while
	// the normalized table keeps the ids written by earlier CLI turns; marking
	// both prevents the next save from appending the same text twice.
	m.persisted = make(map[string]bool, len(m.messages)+len(record.Messages))
	for _, message := range m.messages {
		if message.ID != "" {
			m.persisted[message.ID] = true
		}
	}
	for _, message := range record.Messages {
		if message.ID != "" {
			m.persisted[message.ID] = true
		}
	}
	if record.Model != "" {
		m.modelID = record.Model
	}
	m.sessionBackend = record.Provider
	if m.sessionBackend == "" {
		m.sessionBackend = "axon"
	}
	m.backendSessionID = record.BackendSessionID
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
	payloadText, payloadErr := payload.Encode(payload.Meta{
		ID:        m.sessionID,
		Title:     m.sessionTitle,
		Model:     m.modelID,
		Action:    "agent",
		CreatedAt: m.sessionCreated,
		UpdatedAt: time.Now(),
	}, messages)
	if payloadErr != nil {
		payloadText = ""
	}

	source := m.sessionSource
	if source == "" {
		source = "cli"
	}
	if err := m.sessions.UpsertSession(store.Session{
		ID:               m.sessionID,
		Workspace:        m.workspace,
		Title:            m.sessionTitle,
		Model:            m.modelID,
		Provider:         m.sessionBackend,
		BackendSessionID: m.backendSessionID,
		Action:           "agent",
		Source:           source,
		Payload:          payloadText,
		CreatedAt:        m.sessionCreated,
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

func decodePayload(raw string, fallback []store.Message) []components.Message {
	if raw == "" {
		return transcriptMessages(fallback)
	}
	decoded, err := payload.Decode(raw)
	if err != nil {
		return transcriptMessages(fallback)
	}
	return transcriptMessages(decoded)
}

func sessionOptions(
	sessions []store.Summary,
	currentID string,
) []sessionpicker.Option {
	options := make([]sessionpicker.Option, 0, len(sessions))
	for _, session := range sessions {
		options = append(options, sessionpicker.Option{
			ID:      session.ID,
			Title:   session.Title,
			Model:   session.Model,
			Source:  session.Source,
			Updated: session.UpdatedAt.Local().Format("Jan 2 15:04"),
			Current: session.ID == currentID,
		})
	}
	return options
}
