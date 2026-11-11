// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package editorimport_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/GordenArcher/axon-core/internal/sessions"
	"github.com/GordenArcher/axon-core/internal/sessions/editorimport"
)

func TestRunImportsEditorWorkspaceOnce(t *testing.T) {
	root := t.TempDir()
	workspace := t.TempDir()
	workspaceDirectory := filepath.Join(root, "workspace-1")
	if err := os.MkdirAll(workspaceDirectory, 0o755); err != nil {
		t.Fatalf("create workspace directory: %v", err)
	}

	conversation := map[string]any{
		"id":        "conversation-1",
		"title":     "Sidebar conversation",
		"createdAt": 1000,
		"updatedAt": 2000,
		"pinned":    true,
		"action":    "agent",
		"messages": []any{
			map[string]any{"id": 1, "role": "user", "content": "from the sidebar"},
		},
	}
	file := map[string]any{
		"version":       1,
		"workspacePath": workspace,
		"conversation":  conversation,
	}
	raw, err := json.Marshal(file)
	if err != nil {
		t.Fatalf("marshal conversation: %v", err)
	}
	if err := os.WriteFile(
		filepath.Join(workspaceDirectory, "conversation-conversation-1.json"),
		raw,
		0o644,
	); err != nil {
		t.Fatalf("write conversation: %v", err)
	}
	index, _ := json.Marshal(map[string]any{
		"version":       1,
		"activeId":      "conversation-1",
		"conversations": []any{},
	})
	if err := os.WriteFile(
		filepath.Join(workspaceDirectory, "index.json"),
		index,
		0o644,
	); err != nil {
		t.Fatalf("write index: %v", err)
	}

	store, err := sessions.OpenAt(filepath.Join(t.TempDir(), "sessions.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() {
		_ = store.Close()
	})

	if err := editorimport.Run(root, store); err != nil {
		t.Fatalf("import editor workspaces: %v", err)
	}

	loaded, err := store.LoadSession("conversation-1")
	if err != nil {
		t.Fatalf("load imported session: %v", err)
	}
	if loaded.Source != "editor" {
		t.Fatalf("source = %q", loaded.Source)
	}
	if loaded.Title != "Sidebar conversation" {
		t.Fatalf("title = %q", loaded.Title)
	}
	if loaded.Payload == "" || !json.Valid([]byte(loaded.Payload)) {
		t.Fatalf("payload is invalid: %q", loaded.Payload)
	}
	if !loaded.Pinned {
		t.Fatal("pinned state was not imported")
	}

	// A second run must not add a duplicate or overwrite the existing row.
	if err := editorimport.Run(root, store); err != nil {
		t.Fatalf("second import: %v", err)
	}
	count, err := store.Count()
	if err != nil {
		t.Fatalf("count sessions: %v", err)
	}
	if count != 1 {
		t.Fatalf("sessions = %d, want 1", count)
	}
	if _, err := os.Stat(filepath.Join(root, "editor-imported")); err != nil {
		t.Fatalf("marker missing: %v", err)
	}

	active, err := store.Active(workspace)
	if err != nil {
		t.Fatalf("active conversation: %v", err)
	}
	if active != "conversation-1" {
		t.Fatalf("active = %q", active)
	}
}

func TestRunSkipsMissingRoot(t *testing.T) {
	store, err := sessions.OpenAt(filepath.Join(t.TempDir(), "sessions.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() {
		_ = store.Close()
	})
	if err := editorimport.Run(filepath.Join(t.TempDir(), "missing"), store); err != nil {
		t.Fatalf("missing root should be ignored: %v", err)
	}
}

func TestRunToleratesBrokenFiles(t *testing.T) {
	root := t.TempDir()
	directory := filepath.Join(root, "workspace-1")
	if err := os.MkdirAll(directory, 0o755); err != nil {
		t.Fatalf("create directory: %v", err)
	}
	if err := os.WriteFile(
		filepath.Join(directory, "conversation-broken.json"),
		[]byte("{not json"),
		0o644,
	); err != nil {
		t.Fatalf("write broken file: %v", err)
	}

	store, err := sessions.OpenAt(filepath.Join(t.TempDir(), "sessions.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() {
		_ = store.Close()
	})
	if err := editorimport.Run(root, store); err != nil {
		t.Fatalf("broken file should not fail the import: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "editor-imported")); err != nil {
		t.Fatalf("marker missing: %v", err)
	}
}
