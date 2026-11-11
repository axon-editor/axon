// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package session

import (
	"time"
)

func (s *Store) Upsert(record Session) error {
	record.Workspace = normalizedWorkspace(record.Workspace)
	now := time.Now().UnixMilli()
	created := record.CreatedAt.UnixMilli()
	if record.CreatedAt.IsZero() {
		created = now
	}
	updated := record.UpdatedAt.UnixMilli()
	if record.UpdatedAt.IsZero() {
		updated = now
	}
	pinned := 0
	if record.Pinned {
		pinned = 1
	}
	action := record.Action
	if action == "" {
		action = "agent"
	}
	source := record.Source
	if source == "" {
		source = "cli"
	}

	_, err := s.db.Exec(
		`INSERT INTO sessions (
			id, workspace, title, model, provider, backend_session_id,
			action, source, payload, created_at, updated_at, pinned
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			model = excluded.model,
			provider = excluded.provider,
			backend_session_id = excluded.backend_session_id,
			action = excluded.action,
			source = excluded.source,
			payload = excluded.payload,
			updated_at = excluded.updated_at,
			pinned = excluded.pinned`,
		record.ID,
		record.Workspace,
		record.Title,
		record.Model,
		record.Provider,
		record.BackendSessionID,
		action,
		source,
		record.Payload,
		created,
		updated,
		pinned,
	)
	if err != nil {
		return err
	}

	// Trim per workspace so one busy project cannot evict another project's
	// conversations. The editor and CLI share this limit.
	_, err = s.db.Exec(
		`DELETE FROM sessions
		WHERE id IN (
			SELECT id FROM sessions
			WHERE workspace = ?
			ORDER BY updated_at DESC
			LIMIT -1 OFFSET ?
		)`,
		record.Workspace,
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

func (s *Store) SetActive(workspace, conversationID string) error {
	workspace = normalizedWorkspace(workspace)
	_, err := s.db.Exec(
		`INSERT INTO workspaces (path, active_conversation_id, updated_at)
		VALUES (?, ?, ?)
		ON CONFLICT(path) DO UPDATE SET
			active_conversation_id = excluded.active_conversation_id,
			updated_at = excluded.updated_at`,
		workspace,
		conversationID,
		time.Now().UnixMilli(),
	)
	return err
}

func (s *Store) Delete(id string) error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE id = ?`, id)
	return err
}
