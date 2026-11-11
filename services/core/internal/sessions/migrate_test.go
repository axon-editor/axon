// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package sessions

import (
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

// Existing CLI databases were created at schema version 1. The kind/data
// columns arrived in version 2, so this guards the upgrade path rather than only
// proving that a fresh database works.
func TestOpenAtMigratesVersionOneDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sessions.db")

	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open seed database: %v", err)
	}
	statements := []string{
		`CREATE TABLE sessions (
			id TEXT PRIMARY KEY,
			workspace TEXT NOT NULL,
			title TEXT NOT NULL,
			model TEXT NOT NULL DEFAULT '',
			provider TEXT NOT NULL DEFAULT '',
			backend_session_id TEXT NOT NULL DEFAULT '',
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			pinned INTEGER NOT NULL DEFAULT 0
		)`,
		`CREATE TABLE messages (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
			sequence INTEGER NOT NULL,
			role TEXT NOT NULL,
			content TEXT NOT NULL,
			thinking INTEGER NOT NULL DEFAULT 0,
			collapsed INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL
		)`,
		`CREATE TABLE events (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
			message_id TEXT,
			sequence INTEGER NOT NULL,
			type TEXT NOT NULL,
			data TEXT NOT NULL,
			created_at INTEGER NOT NULL
		)`,
		`PRAGMA user_version = 1`,
	}
	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("seed version one schema: %v", err)
		}
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close seed database: %v", err)
	}

	sessions, err := OpenAt(path)
	if err != nil {
		t.Fatalf("open migrated store: %v", err)
	}
	t.Cleanup(func() {
		_ = sessions.Close()
	})

	if err := sessions.UpsertSession(Session{
		ID:        "s1",
		Workspace: "/tmp/axon",
		Title:     "Migrated",
	}); err != nil {
		t.Fatalf("upsert migrated session: %v", err)
	}
	if err := sessions.AppendMessages("s1", []Message{
		{
			ID:   "m1",
			Role: "tool",
			Kind: "tool",
			Data: `{"callId":"c1","name":"read_file"}`,
		},
	}); err != nil {
		t.Fatalf("append tool row after migration: %v", err)
	}

	loaded, err := sessions.LoadSession("s1")
	if err != nil {
		t.Fatalf("load migrated session: %v", err)
	}
	if len(loaded.Messages) != 1 {
		t.Fatalf("expected one migrated message, got %#v", loaded.Messages)
	}
	if loaded.Messages[0].Kind != "tool" {
		t.Fatalf("kind did not survive migration: %#v", loaded.Messages[0])
	}
}
