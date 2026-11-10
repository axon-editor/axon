// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package session

import (
	"database/sql"
	"time"
)

// maxSessions bounds the list shown by the picker. The editor's conversation
// store uses the same ceiling so the two surfaces do not drift apart.
const maxSessions = 100

// Session is the persisted conversation header plus its transcript.
type Session struct {
	ID               string
	Workspace        string
	Title            string
	Model            string
	Provider         string
	BackendSessionID string
	CreatedAt        time.Time
	UpdatedAt        time.Time
	Pinned           bool
	Messages         []Message
}

// Summary is the lightweight row the session picker needs. Loading full
// transcripts just to render a list would make resume slower as history grows.
type Summary struct {
	ID        string
	Title     string
	Model     string
	UpdatedAt time.Time
}

// Message is the storage-side transcript unit. It deliberately mirrors the TUI
// message shape without importing the UI package; the app owns the conversion.
type Message struct {
	ID        string
	Role      string
	Content   string
	Thinking  bool
	Collapsed bool
}

// Store is the session row/transcript repository.
type Store struct {
	db *sql.DB
}

func New(db *sql.DB) *Store {
	return &Store{db: db}
}
