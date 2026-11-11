// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package sessions

import (
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/GordenArcher/axon-core/internal/sessions/database"
	"github.com/GordenArcher/axon-core/internal/sessions/editorimport"
	"github.com/GordenArcher/axon-core/internal/sessions/identity"
	"github.com/GordenArcher/axon-core/internal/sessions/session"
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

// Path is the shared CLI/editor database. The old CLI-only path is migrated on
// first open so existing terminal conversations are not stranded.
func Path() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".axon", "sessions", "sessions.db"), nil
}

func Open() (*Store, error) {
	path, err := Path()
	if err != nil {
		return nil, err
	}
	copied, err := migrateLegacyDatabase(path)
	if err != nil {
		return nil, err
	}
	store, err := OpenAt(path)
	if err != nil {
		return nil, err
	}

	// A different process may have created the shared database before the CLI
	// ran. Import through the normal API once so editor-only rows do not block
	// the old terminal conversations.
	marker := filepath.Join(filepath.Dir(path), "cli-imported")
	if _, err := os.Stat(marker); os.IsNotExist(err) {
		if copied {
			writeImportMarker(marker)
		} else if err := importLegacySessions(store); err == nil {
			writeImportMarker(marker)
		}
	}

	// The editor writes per-workspace JSON files. Import them once so a new
	// Core or CLI can see existing sidebar conversations before the editor has
	// been rebuilt with the shared-store handler.
	_ = editorimport.Run(filepath.Dir(path), store)
	return store, nil
}

func writeImportMarker(path string) {
	_ = os.WriteFile(
		path,
		[]byte(time.Now().UTC().Format(time.RFC3339)),
		0o600,
	)
}

func importLegacySessions(destination *Store) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	legacyPath := filepath.Join(home, ".axon", "cli", "sessions", "sessions.db")
	targetPath, err := Path()
	if err != nil || legacyPath == targetPath {
		return err
	}
	if _, err := os.Stat(legacyPath); err != nil {
		return nil
	}

	legacy, err := OpenAt(legacyPath)
	if err != nil {
		return err
	}
	defer legacy.Close()

	records, err := legacy.sessions.ListAllFull()
	if err != nil {
		return err
	}
	activeSet := make(map[string]bool)
	for _, record := range records {
		full, err := legacy.LoadSession(record.ID)
		if err != nil {
			continue
		}
		if err := destination.UpsertSession(record); err != nil {
			continue
		}
		if len(full.Messages) > 0 {
			_ = destination.AppendMessages(record.ID, full.Messages)
		}
		if !activeSet[record.Workspace] {
			_ = destination.SetActive(record.Workspace, record.ID)
			activeSet[record.Workspace] = true
		}
	}
	return nil
}

func migrateLegacyDatabase(path string) (bool, error) {
	if _, err := os.Stat(path); err == nil {
		return false, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return false, nil
	}
	legacy := filepath.Join(home, ".axon", "cli", "sessions", "sessions.db")
	if _, err := os.Stat(legacy); err != nil {
		return false, nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return false, err
	}
	for _, suffix := range []string{"", "-wal", "-shm"} {
		source := legacy + suffix
		if _, err := os.Stat(source); err != nil {
			continue
		}
		if err := copyFile(source, path+suffix); err != nil {
			return false, err
		}
	}
	return true, nil
}

func copyFile(source, destination string) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()

	output, err := os.OpenFile(destination, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	if _, err := io.Copy(output, input); err != nil {
		_ = output.Close()
		return err
	}
	return output.Close()
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

func (s *Store) ListFull(workspace string) ([]Session, error) {
	return s.sessions.ListFull(workspace)
}

func (s *Store) Count() (int, error) {
	return s.sessions.Count()
}

func (s *Store) Source(id string) (string, error) {
	return s.sessions.Source(id)
}

func (s *Store) Active(workspace string) (string, error) {
	return s.sessions.Active(workspace)
}

func (s *Store) SetActive(workspace, conversationID string) error {
	return s.sessions.SetActive(workspace, conversationID)
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
