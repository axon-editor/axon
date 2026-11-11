// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package session

import (
	"database/sql"
	"errors"
	"time"
)

func (s *Store) Load(id string) (Session, error) {
	var record Session
	var createdAt int64
	var updatedAt int64
	var pinned int

	err := s.db.QueryRow(
		`SELECT id, workspace, title, model, provider, backend_session_id,
			action, source, payload, created_at, updated_at, pinned
		FROM sessions WHERE id = ?`,
		id,
	).Scan(
		&record.ID,
		&record.Workspace,
		&record.Title,
		&record.Model,
		&record.Provider,
		&record.BackendSessionID,
		&record.Action,
		&record.Source,
		&record.Payload,
		&createdAt,
		&updatedAt,
		&pinned,
	)
	if err != nil {
		return Session{}, err
	}
	record.CreatedAt = time.UnixMilli(createdAt)
	record.UpdatedAt = time.UnixMilli(updatedAt)
	record.Pinned = pinned != 0

	rows, err := s.db.Query(
		`SELECT id, role, content, thinking, collapsed, kind, data
		FROM messages WHERE session_id = ? ORDER BY sequence ASC`,
		id,
	)
	if err != nil {
		return Session{}, err
	}
	defer rows.Close()

	for rows.Next() {
		var message Message
		var thinking int
		var collapsed int
		if err := rows.Scan(
			&message.ID,
			&message.Role,
			&message.Content,
			&thinking,
			&collapsed,
			&message.Kind,
			&message.Data,
		); err != nil {
			return Session{}, err
		}
		message.Thinking = thinking != 0
		message.Collapsed = collapsed != 0
		record.Messages = append(record.Messages, message)
	}
	if err := rows.Err(); err != nil {
		return Session{}, err
	}
	return record, nil
}

// ListFull returns the metadata and payload for every conversation in a
// workspace. The editor needs the full records; the CLI uses Load/List because
// it also wants normalized messages.
func (s *Store) Source(id string) (string, error) {
	var source string
	err := s.db.QueryRow(`SELECT source FROM sessions WHERE id = ?`, id).Scan(&source)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	return source, nil
}

func (s *Store) Count() (int, error) {
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM sessions`).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

// ListAllFull is used only by the one-time legacy database import.
func (s *Store) ListAllFull() ([]Session, error) {
	rows, err := s.db.Query(
		`SELECT id, workspace, title, model, provider, backend_session_id,
			action, source, payload, created_at, updated_at, pinned
		FROM sessions ORDER BY updated_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := make([]Session, 0)
	for rows.Next() {
		var record Session
		var createdAt int64
		var updatedAt int64
		var pinned int
		if err := rows.Scan(
			&record.ID,
			&record.Workspace,
			&record.Title,
			&record.Model,
			&record.Provider,
			&record.BackendSessionID,
			&record.Action,
			&record.Source,
			&record.Payload,
			&createdAt,
			&updatedAt,
			&pinned,
		); err != nil {
			return nil, err
		}
		record.CreatedAt = time.UnixMilli(createdAt)
		record.UpdatedAt = time.UnixMilli(updatedAt)
		record.Pinned = pinned != 0
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return records, nil
}

func (s *Store) ListFull(workspace string) ([]Session, error) {
	workspace = normalizedWorkspace(workspace)
	rows, err := s.db.Query(
		`SELECT id, workspace, title, model, provider, backend_session_id,
			action, source, payload, created_at, updated_at, pinned
		FROM sessions WHERE workspace = ?
		ORDER BY updated_at ASC LIMIT ?`,
		workspace,
		maxSessions,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := make([]Session, 0)
	for rows.Next() {
		var record Session
		var createdAt int64
		var updatedAt int64
		var pinned int
		if err := rows.Scan(
			&record.ID,
			&record.Workspace,
			&record.Title,
			&record.Model,
			&record.Provider,
			&record.BackendSessionID,
			&record.Action,
			&record.Source,
			&record.Payload,
			&createdAt,
			&updatedAt,
			&pinned,
		); err != nil {
			return nil, err
		}
		record.CreatedAt = time.UnixMilli(createdAt)
		record.UpdatedAt = time.UnixMilli(updatedAt)
		record.Pinned = pinned != 0
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return records, nil
}

func (s *Store) Active(workspace string) (string, error) {
	workspace = normalizedWorkspace(workspace)
	var active string
	err := s.db.QueryRow(
		`SELECT active_conversation_id FROM workspaces WHERE path = ?`,
		workspace,
	).Scan(&active)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	return active, nil
}

func (s *Store) List(workspace string) ([]Summary, error) {
	workspace = normalizedWorkspace(workspace)
	rows, err := s.db.Query(
		`SELECT id, title, model, source, updated_at
		FROM sessions WHERE workspace = ?
		ORDER BY updated_at DESC LIMIT ?`,
		workspace,
		maxSessions,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	summaries := make([]Summary, 0)
	for rows.Next() {
		var summary Summary
		var updatedAt int64
		if err := rows.Scan(
			&summary.ID,
			&summary.Title,
			&summary.Model,
			&summary.Source,
			&updatedAt,
		); err != nil {
			return nil, err
		}
		summary.UpdatedAt = time.UnixMilli(updatedAt)
		summaries = append(summaries, summary)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return summaries, nil
}
