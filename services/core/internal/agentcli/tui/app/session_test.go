// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"path/filepath"
	"testing"
	"time"

	store "github.com/GordenArcher/axon-core/internal/sessions"
	"github.com/GordenArcher/axon-core/internal/sessions/payload"
	"github.com/GordenArcher/axon-core/internal/sessions/session"
)

func TestLoadSessionPrefersNormalizedCLIRows(t *testing.T) {
	sessions, err := store.OpenAt(filepath.Join(t.TempDir(), "sessions.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() {
		_ = sessions.Close()
	})

	payloadText, err := payload.Encode(payload.Meta{
		ID:        "cli",
		Title:     "CLI",
		CreatedAt: time.Now(),
	}, []session.Message{
		{Role: "user", Content: "from payload"},
	})
	if err != nil {
		t.Fatalf("encode payload: %v", err)
	}
	if err := sessions.UpsertSession(store.Session{
		ID:        "cli",
		Workspace: "/tmp/axon",
		Title:     "CLI",
		Source:    "cli",
		Payload:   payloadText,
		CreatedAt: time.Now(),
	}); err != nil {
		t.Fatalf("upsert session: %v", err)
	}
	if err := sessions.AppendMessages("cli", []store.Message{
		{ID: "m1", Role: "user", Content: "from rows"},
	}); err != nil {
		t.Fatalf("append messages: %v", err)
	}

	model := Model{sessions: sessions, persisted: make(map[string]bool)}
	model.loadSession("cli")

	if len(model.messages) != 1 || model.messages[0].Content != "from rows" {
		t.Fatalf("CLI rows were not preferred: %#v", model.messages)
	}
}

func TestLoadSessionDecodesEditorPayload(t *testing.T) {
	sessions, err := store.OpenAt(filepath.Join(t.TempDir(), "sessions.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() {
		_ = sessions.Close()
	})

	payloadText, err := payload.Encode(payload.Meta{
		ID:        "editor",
		Title:     "Editor",
		CreatedAt: time.Now(),
	}, []session.Message{
		{Role: "user", Content: "from editor"},
	})
	if err != nil {
		t.Fatalf("encode payload: %v", err)
	}
	if err := sessions.UpsertSession(store.Session{
		ID:        "editor",
		Workspace: "/tmp/axon",
		Title:     "Editor",
		Source:    "editor",
		Payload:   payloadText,
		CreatedAt: time.Now(),
	}); err != nil {
		t.Fatalf("upsert session: %v", err)
	}

	model := Model{sessions: sessions, persisted: make(map[string]bool)}
	model.loadSession("editor")

	if len(model.messages) != 1 || model.messages[0].Content != "from editor" {
		t.Fatalf("editor payload was not decoded: %#v", model.messages)
	}
	if model.sessionSource != "editor" {
		t.Fatalf("session source = %q", model.sessionSource)
	}
}
