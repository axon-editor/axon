// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package store

import (
	"os"
	"path/filepath"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/store/database"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/store/identity"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/store/session"
)

// The facade keeps callers on the store package while the internals can grow
// without leaking SQL types or a second import path into the TUI.
type Session = session.Session
type Summary = session.Summary
type Message = session.Message

const DefaultTitle = identity.DefaultTitle

type Store struct {
	database *database.Database
	sessions *session.Store
}

// Path owns the CLI-only database location. It is separate from the editor's
// ~/.axon/sessions tree because the TUI schema is still evolving faster than
// the editor's conversation format.
func Path() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".axon", "cli", "sessions", "sessions.db"), nil
}

func Open() (*Store, error) {
	path, err := Path()
	if err != nil {
		return nil, err
	}
	return OpenAt(path)
}

func OpenAt(path string) (*Store, error) {
	database, err := database.Open(path)
	if err != nil {
		return nil, err
	}
	return &Store{
		database: database,
		sessions: session.New(database.SQL()),
	}, nil
}

func (s *Store) Close() error {
	return s.database.Close()
}

func (s *Store) UpsertSession(record Session) error {
	return s.sessions.Upsert(record)
}

func (s *Store) AppendMessages(sessionID string, messages []Message) error {
	return s.sessions.Append(sessionID, messages)
}

func (s *Store) LoadSession(id string) (Session, error) {
	return s.sessions.Load(id)
}

func (s *Store) List(workspace string) ([]Summary, error) {
	return s.sessions.List(workspace)
}

func (s *Store) Delete(id string) error {
	return s.sessions.Delete(id)
}

func NewID() string {
	return identity.NewID()
}

func Title(prompt string) string {
	return identity.Title(prompt)
}
