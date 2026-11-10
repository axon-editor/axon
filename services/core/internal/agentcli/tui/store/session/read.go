// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package session

import "time"

func (s *Store) Load(id string) (Session, error) {
	var record Session
	var createdAt int64
	var updatedAt int64
	var pinned int

	err := s.db.QueryRow(
		`SELECT id, workspace, title, model, provider, backend_session_id,
			created_at, updated_at, pinned
		FROM sessions WHERE id = ?`,
		id,
	).Scan(
		&record.ID,
		&record.Workspace,
		&record.Title,
		&record.Model,
		&record.Provider,
		&record.BackendSessionID,
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
		`SELECT id, role, content, thinking, collapsed
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

func (s *Store) List(workspace string) ([]Summary, error) {
	rows, err := s.db.Query(
		`SELECT id, title, model, updated_at
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
