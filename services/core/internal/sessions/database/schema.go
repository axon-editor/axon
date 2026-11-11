// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package database

import "fmt"

// migrations is the source of truth for schema changes. PRAGMA user_version
// records what has run, so an existing database applies only the new steps
// instead of replaying every DDL statement on each launch.
type migration struct {
	version    int
	statements []string
}

var migrations = []migration{
	{version: 1, statements: schemaV1},
	{version: 2, statements: schemaV2},
	{version: 3, statements: schemaV3},
}

var schemaV1 = []string{
	`CREATE TABLE IF NOT EXISTS sessions (
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
	`CREATE INDEX IF NOT EXISTS idx_sessions_workspace_updated
		ON sessions(workspace, updated_at DESC)`,
	// Message rows are append-only. sequence is the transcript order and is
	// allocated inside the write transaction rather than by SQLite rowid, so
	// reordering or compaction cannot silently change what the user sees.
	`CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
		sequence INTEGER NOT NULL,
		role TEXT NOT NULL,
		content TEXT NOT NULL,
		thinking INTEGER NOT NULL DEFAULT 0,
		collapsed INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS idx_messages_session_sequence
		ON messages(session_id, sequence)`,
	// events is reserved for approvals and usage. Tool cards live in messages
	// because they are transcript items and must keep their exact position.
	`CREATE TABLE IF NOT EXISTS events (
		id TEXT PRIMARY KEY,
		session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
		message_id TEXT,
		sequence INTEGER NOT NULL,
		type TEXT NOT NULL,
		data TEXT NOT NULL,
		created_at INTEGER NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS idx_events_session_sequence
		ON events(session_id, sequence)`,
}

// schemaV2 gives messages a kind and a payload. A tool card is a transcript
// part, not a side channel: keeping it in the same table means resume preserves
// the interleaving of user text, tool calls, and the final answer for free.
var schemaV2 = []string{
	`ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'text'`,
	`ALTER TABLE messages ADD COLUMN data TEXT NOT NULL DEFAULT ''`,
}

// schemaV3 turns the CLI database into the shared editor/CLI store. Editor
// conversations keep their own JSON message shape in payload while the session
// columns stay queryable for both surfaces.
var schemaV3 = []string{
	`ALTER TABLE sessions ADD COLUMN action TEXT NOT NULL DEFAULT 'agent'`,
	`ALTER TABLE sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'cli'`,
	`ALTER TABLE sessions ADD COLUMN payload TEXT NOT NULL DEFAULT ''`,
	`CREATE TABLE IF NOT EXISTS workspaces (
		path TEXT PRIMARY KEY,
		active_conversation_id TEXT NOT NULL DEFAULT '',
		updated_at INTEGER NOT NULL
	)`,
}

func (d *Database) Migrate() error {
	var version int
	if err := d.db.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil {
		return err
	}

	for _, step := range migrations {
		if step.version <= version {
			continue
		}
		// Each migration and its version stamp must land together. A
		// half-applied ALTER would make the next launch believe the columns
		// already exist when they do not.
		tx, err := d.db.Begin()
		if err != nil {
			return err
		}
		for _, statement := range step.statements {
			if _, err := tx.Exec(statement); err != nil {
				_ = tx.Rollback()
				return err
			}
		}
		// PRAGMA does not accept placeholders, and the value comes from a
		// package constant, not user input.
		if _, err := tx.Exec(fmt.Sprintf(`PRAGMA user_version = %d`, step.version)); err != nil {
			_ = tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
		version = step.version
	}

	return nil
}
