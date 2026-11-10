// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package session

import (
	"time"
)

func (s *Store) Upsert(record Session) error {
	now := time.Now().UnixMilli()
	created := record.CreatedAt.UnixMilli()
	if record.CreatedAt.IsZero() {
		created = now
	}
	pinned := 0
	if record.Pinned {
		pinned = 1
	}

	_, err := s.db.Exec(
		`INSERT INTO sessions (
			id, workspace, title, model, provider, backend_session_id,
			created_at, updated_at, pinned
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			model = excluded.model,
			provider = excluded.provider,
			backend_session_id = excluded.backend_session_id,
			updated_at = excluded.updated_at,
			pinned = excluded.pinned`,
		record.ID,
		record.Workspace,
		record.Title,
		record.Model,
		record.Provider,
		record.BackendSessionID,
		created,
		now,
		pinned,
	)
	if err != nil {
		return err
	}

	// Trim in the same call as the upsert so a long-lived CLI cannot grow the
	// database forever. The limit is per database, not per workspace, matching
	// the picker contract.
	_, err = s.db.Exec(
		`DELETE FROM sessions
		WHERE id NOT IN (
			SELECT id FROM sessions ORDER BY updated_at DESC LIMIT ?
		)`,
		maxSessions,
	)
	return err
}

// Append writes only messages the caller has not persisted yet. Sequence
// numbers come from MAX(sequence) inside the transaction, so two callers cannot
// hand out the same slot. INSERT OR REPLACE keeps a retry of the same message
// idempotent without creating a second row.
func (s *Store) Append(sessionID string, messages []Message) error {
	if len(messages) == 0 {
		return nil
	}

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() {
		_ = tx.Rollback()
	}()

	var sequence int
	if err := tx.QueryRow(
		`SELECT COALESCE(MAX(sequence), 0) FROM messages WHERE session_id = ?`,
		sessionID,
	).Scan(&sequence); err != nil {
		return err
	}

	statement, err := tx.Prepare(
		`INSERT OR REPLACE INTO messages (
			id, session_id, sequence, role, content, thinking, collapsed,
			kind, data, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	)
	if err != nil {
		return err
	}
	defer statement.Close()

	now := time.Now().UnixMilli()
	for _, message := range messages {
		if message.ID == "" {
			continue
		}
		sequence++
		thinking := 0
		if message.Thinking {
			thinking = 1
		}
		collapsed := 0
		if message.Collapsed {
			collapsed = 1
		}
		kind := message.Kind
		if kind == "" {
			kind = "text"
		}
		if _, err := statement.Exec(
			message.ID,
			sessionID,
			sequence,
			message.Role,
			message.Content,
			thinking,
			collapsed,
			kind,
			message.Data,
			now,
		); err != nil {
			return err
		}
	}

	if _, err := tx.Exec(
		`UPDATE sessions SET updated_at = ? WHERE id = ?`,
		now,
		sessionID,
	); err != nil {
		return err
	}

	return tx.Commit()
}

func (s *Store) Delete(id string) error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE id = ?`, id)
	return err
}
