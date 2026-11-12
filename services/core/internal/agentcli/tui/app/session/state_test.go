// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package session

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/app/transcript"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
	store "github.com/GordenArcher/axon-core/internal/sessions"
	"github.com/GordenArcher/axon-core/internal/sessions/payload"
	"github.com/GordenArcher/axon-core/internal/sessions/session"
)

func testStore(t *testing.T) *store.Store {
	t.Helper()
	sessions, err := store.OpenAt(filepath.Join(t.TempDir(), "sessions.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() {
		_ = sessions.Close()
	})
	return sessions
}

func TestLoadPrefersNormalizedCLIRows(t *testing.T) {
	sessions := testStore(t)
	payloadText, err := payload.Encode(payload.Meta{
		ID:        "cli",
		Title:     "CLI",
		CreatedAt: time.Now(),
	}, []session.Message{{Role: "user", Content: "from payload"}})
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

	state := State{Workspace: "/tmp/axon", Store: sessions, ID: "other", Persisted: map[string]bool{}}
	messages, err := state.Load("cli")
	if err != nil {
		t.Fatalf("load session: %v", err)
	}
	if len(messages) != 1 || messages[0].Content != "from rows" {
		t.Fatalf("CLI rows were not preferred: %#v", messages)
	}
}

func TestLoadDecodesEditorPayload(t *testing.T) {
	sessions := testStore(t)
	payloadText, err := payload.Encode(payload.Meta{
		ID:        "editor",
		Title:     "Editor",
		CreatedAt: time.Now(),
	}, []session.Message{{Role: "user", Content: "from editor"}})
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

	state := State{Workspace: "/tmp/axon", Store: sessions, ID: "other", Persisted: map[string]bool{}}
	messages, err := state.Load("editor")
	if err != nil {
		t.Fatalf("load session: %v", err)
	}
	if len(messages) != 1 || messages[0].Content != "from editor" {
		t.Fatalf("editor payload was not decoded: %#v", messages)
	}
	if state.Source != "editor" {
		t.Fatalf("session source = %q", state.Source)
	}
}

func TestSavePersistsToolCardsOnce(t *testing.T) {
	sessions := testStore(t)
	state := New("/tmp/axon", sessions)
	state.ID = "s1"

	conversation := transcript.NewState()
	conversation.AppendTool(client.Event{
		ToolCallID: "call-1",
		ToolName:   "read_file",
		Arguments:  `{"path":"main.go"}`,
	})
	conversation.FinishTool(client.Event{
		ToolCallID: "call-1",
		ToolName:   "read_file",
		Result:     "package main",
		OK:         true,
		DurationMS: 3,
	})

	if err := state.Save(conversation.Messages); err != nil {
		t.Fatalf("save session: %v", err)
	}
	loaded, err := sessions.LoadSession("s1")
	if err != nil {
		t.Fatalf("load saved session: %v", err)
	}
	if len(loaded.Messages) != 1 || loaded.Messages[0].Kind != "tool" {
		t.Fatalf("persisted rows = %#v", loaded.Messages)
	}

	// A second save must not duplicate the card.
	if err := state.Save(conversation.Messages); err != nil {
		t.Fatalf("save session again: %v", err)
	}
	loaded, err = sessions.LoadSession("s1")
	if err != nil {
		t.Fatalf("reload saved session: %v", err)
	}
	if len(loaded.Messages) != 1 {
		t.Fatalf("saving twice duplicated the tool row: %#v", loaded.Messages)
	}

	restored := transcript.FromRows(loaded.Messages)
	if len(restored) != 1 || restored[0].Tool == nil {
		t.Fatalf("tool card did not restore: %#v", restored)
	}
	if restored[0].Tool.Name != "read_file" {
		t.Fatalf("restored tool name = %q", restored[0].Tool.Name)
	}
}

func TestOptionsListsWorkspaceSessions(t *testing.T) {
	sessions := testStore(t)
	if err := sessions.UpsertSession(store.Session{
		ID:        "s1",
		Workspace: "/tmp/axon",
		Title:     "Saved",
		CreatedAt: time.Now(),
	}); err != nil {
		t.Fatalf("upsert session: %v", err)
	}
	state := New("/tmp/axon", sessions)
	options, err := state.Options()
	if err != nil {
		t.Fatalf("list options: %v", err)
	}
	if len(options) != 1 || options[0].Title != "Saved" {
		t.Fatalf("options = %#v", options)
	}
}
