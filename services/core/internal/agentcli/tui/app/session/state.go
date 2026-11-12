// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package session

import (
	"errors"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/app/transcript"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	store "github.com/GordenArcher/axon-core/internal/sessions"
	"github.com/GordenArcher/axon-core/internal/sessions/payload"
)

// State owns the database identity of one conversation. The transcript package
// owns the visible rows; this package owns the header, the provider session id,
// and the write-behind bookkeeping that keeps resumed conversations from
// duplicating messages.
type State struct {
	Workspace        string
	Store            *store.Store
	ID               string
	Title            string
	Source           string
	Backend          string
	BackendSessionID string
	Model            string
	Created          time.Time
	Persisted        map[string]bool
}

// New starts an unsaved conversation. The id exists before the first prompt so
// the user turn can be persisted before the model answers.
func New(workspace string, sessions *store.Store) State {
	return State{
		Workspace: workspace,
		Store:     sessions,
		ID:        store.NewID(),
		Title:     store.DefaultTitle,
		Source:    "cli",
		Backend:   "axon",
		Created:   time.Now(),
		Persisted: make(map[string]bool),
	}
}

// Load switches the state to one saved conversation and returns the rows the
// caller should install in the transcript. Editor conversations and payload-only
// sessions decode their timeline; CLI conversations keep using normalized rows
// because the editor may truncate a payload it does not understand.
func (s *State) Load(id string) ([]components.Message, error) {
	if s.Store == nil {
		return nil, errors.New("session storage is unavailable")
	}
	record, err := s.Store.LoadSession(id)
	if err != nil {
		return nil, err
	}

	s.ID = record.ID
	s.Title = record.Title
	s.Created = record.CreatedAt
	s.Source = record.Source
	if s.Source == "" {
		s.Source = "cli"
	}

	var messages []components.Message
	switch {
	case s.Source == "editor":
		messages = decodePayload(record.Payload, record.Messages)
	case len(record.Messages) > 0:
		messages = transcript.FromRows(record.Messages)
	case record.Payload != "":
		messages = decodePayload(record.Payload, record.Messages)
	default:
		messages = transcript.FromRows(record.Messages)
	}

	// Mark both views as persisted. The decoded payload gets new row ids, while
	// the normalized table keeps the ids written by earlier CLI turns; marking
	// both prevents the next save from appending the same text twice.
	s.Persisted = make(map[string]bool, len(messages)+len(record.Messages))
	for _, message := range messages {
		if message.ID != "" {
			s.Persisted[message.ID] = true
		}
	}
	for _, message := range record.Messages {
		if message.ID != "" {
			s.Persisted[message.ID] = true
		}
	}

	if record.Model != "" {
		s.Model = record.Model
	}
	s.Backend = record.Provider
	if s.Backend == "" {
		s.Backend = "axon"
	}
	s.BackendSessionID = record.BackendSessionID
	return messages, nil
}

// Save writes the header first so the message foreign key always resolves, then
// appends only unseen rows. Re-appending a stored message would consume a new
// sequence number and push it to the bottom after a resume.
func (s *State) Save(messages []components.Message) error {
	if s.Store == nil {
		return nil
	}
	rows := transcript.Persisted(messages)
	if len(rows) == 0 {
		return nil
	}
	s.Title = transcript.Title(messages, s.Title)

	payloadText, payloadErr := payload.Encode(payload.Meta{
		ID:        s.ID,
		Title:     s.Title,
		Model:     s.Model,
		Action:    "agent",
		CreatedAt: s.Created,
		UpdatedAt: time.Now(),
	}, rows)
	if payloadErr != nil {
		payloadText = ""
	}

	source := s.Source
	if source == "" {
		source = "cli"
	}
	if err := s.Store.UpsertSession(store.Session{
		ID:               s.ID,
		Workspace:        s.Workspace,
		Title:            s.Title,
		Model:            s.Model,
		Provider:         s.Backend,
		BackendSessionID: s.BackendSessionID,
		Action:           "agent",
		Source:           source,
		Payload:          payloadText,
		CreatedAt:        s.Created,
	}); err != nil {
		return err
	}

	pending := make([]store.Message, 0, len(rows))
	for _, row := range rows {
		if s.Persisted[row.ID] {
			continue
		}
		pending = append(pending, row)
	}
	if len(pending) == 0 {
		return nil
	}
	if err := s.Store.AppendMessages(s.ID, pending); err != nil {
		return err
	}
	for _, row := range pending {
		s.Persisted[row.ID] = true
	}
	return nil
}

// Reset starts a new database row. The previous conversation stays resumable and
// the next prompt cannot append to a transcript the user just abandoned.
func (s *State) Reset() {
	s.ID = store.NewID()
	s.Title = store.DefaultTitle
	s.Source = "cli"
	s.Backend = "axon"
	s.BackendSessionID = ""
	s.Created = time.Now()
	s.Persisted = make(map[string]bool)
}

// decodePayload falls back to normalized rows when the timeline is missing or
// corrupt. A half-written payload should not hide a conversation that the
// editor can still show from its row table.
func decodePayload(raw string, fallback []store.Message) []components.Message {
	if raw == "" {
		return transcript.FromRows(fallback)
	}
	decoded, err := payload.Decode(raw)
	if err != nil {
		return transcript.FromRows(fallback)
	}
	return transcript.FromRows(decoded)
}
