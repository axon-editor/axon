// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package database

import "fmt"

// schemaVersion is bumped whenever schemaV1 changes shape. PRAGMA user_version
// records what has run, so an existing database skips the DDL instead of paying
// for a full CREATE IF NOT EXISTS pass on every launch.
const schemaVersion = 1

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
	// events is reserved for tool calls, approvals, and usage. Keeping it in the
	// first schema means those capabilities can ship without another migration.
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

func (d *Database) Migrate() error {
	var version int
	if err := d.db.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil {
		return err
	}
	if version >= schemaVersion {
		return nil
	}

	// DDL plus the version stamp must land together. A half-applied schema would
	// make the next launch believe the tables exist when they do not.
	tx, err := d.db.Begin()
	if err != nil {
		return err
	}
	defer func() {
		_ = tx.Rollback()
	}()

	for _, statement := range schemaV1 {
		if _, err := tx.Exec(statement); err != nil {
			return err
		}
	}
	// PRAGMA does not accept placeholders, and the value is a package constant,
	// not user input.
	if _, err := tx.Exec(fmt.Sprintf(`PRAGMA user_version = %d`, schemaVersion)); err != nil {
		return err
	}
	return tx.Commit()
}
