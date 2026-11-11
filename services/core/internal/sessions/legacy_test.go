// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package sessions

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOpenImportsLegacySessionsIntoExistingSharedDatabase(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	legacyPath := filepath.Join(home, ".axon", "cli", "sessions", "sessions.db")
	if err := os.MkdirAll(filepath.Dir(legacyPath), 0o755); err != nil {
		t.Fatalf("create legacy directory: %v", err)
	}
	legacy, err := OpenAt(legacyPath)
	if err != nil {
		t.Fatalf("open legacy database: %v", err)
	}
	if err := legacy.UpsertSession(Session{
		ID:        "legacy-2",
		Workspace: "/tmp/axon",
		Title:     "Imported conversation",
	}); err != nil {
		t.Fatalf("seed legacy session: %v", err)
	}
	if err := legacy.Close(); err != nil {
		t.Fatalf("close legacy database: %v", err)
	}

	// Simulate Core creating the shared database before the CLI starts.
	sharedPath, err := Path()
	if err != nil {
		t.Fatalf("resolve shared path: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(sharedPath), 0o755); err != nil {
		t.Fatalf("create shared directory: %v", err)
	}
	shared, err := OpenAt(sharedPath)
	if err != nil {
		t.Fatalf("create shared database: %v", err)
	}
	if err := shared.Close(); err != nil {
		t.Fatalf("close shared database: %v", err)
	}

	migrated, err := Open()
	if err != nil {
		t.Fatalf("open migrated database: %v", err)
	}
	t.Cleanup(func() {
		_ = migrated.Close()
	})

	loaded, err := migrated.LoadSession("legacy-2")
	if err != nil {
		t.Fatalf("load imported session: %v", err)
	}
	if loaded.Title != "Imported conversation" {
		t.Fatalf("unexpected imported title: %q", loaded.Title)
	}
}

func TestOpenImportsLegacyWhenSharedDatabaseHasEditorRows(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	legacyPath := filepath.Join(home, ".axon", "cli", "sessions", "sessions.db")
	if err := os.MkdirAll(filepath.Dir(legacyPath), 0o755); err != nil {
		t.Fatalf("create legacy directory: %v", err)
	}
	legacy, err := OpenAt(legacyPath)
	if err != nil {
		t.Fatalf("open legacy database: %v", err)
	}
	if err := legacy.UpsertSession(Session{
		ID:        "legacy-cli",
		Workspace: "/tmp/axon",
		Title:     "Legacy CLI",
	}); err != nil {
		t.Fatalf("seed legacy session: %v", err)
	}
	if err := legacy.Close(); err != nil {
		t.Fatalf("close legacy database: %v", err)
	}

	sharedPath, err := Path()
	if err != nil {
		t.Fatalf("resolve shared path: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(sharedPath), 0o755); err != nil {
		t.Fatalf("create shared directory: %v", err)
	}
	shared, err := OpenAt(sharedPath)
	if err != nil {
		t.Fatalf("create shared database: %v", err)
	}
	if err := shared.UpsertSession(Session{
		ID:        "editor-1",
		Workspace: "/tmp/axon",
		Title:     "Editor",
		Source:    "editor",
	}); err != nil {
		t.Fatalf("seed editor session: %v", err)
	}
	if err := shared.Close(); err != nil {
		t.Fatalf("close shared database: %v", err)
	}

	migrated, err := Open()
	if err != nil {
		t.Fatalf("open migrated database: %v", err)
	}
	t.Cleanup(func() {
		_ = migrated.Close()
	})

	if _, err := migrated.LoadSession("editor-1"); err != nil {
		t.Fatalf("editor session was lost: %v", err)
	}
	if _, err := migrated.LoadSession("legacy-cli"); err != nil {
		t.Fatalf("legacy session was not imported: %v", err)
	}
}

func TestOpenMigratesLegacyCLIDatabase(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	legacyPath := filepath.Join(home, ".axon", "cli", "sessions", "sessions.db")
	if err := os.MkdirAll(filepath.Dir(legacyPath), 0o755); err != nil {
		t.Fatalf("create legacy directory: %v", err)
	}
	legacy, err := OpenAt(legacyPath)
	if err != nil {
		t.Fatalf("open legacy database: %v", err)
	}
	if err := legacy.UpsertSession(Session{
		ID:        "legacy-1",
		Workspace: "/tmp/axon",
		Title:     "Legacy conversation",
	}); err != nil {
		t.Fatalf("seed legacy session: %v", err)
	}
	if err := legacy.Close(); err != nil {
		t.Fatalf("close legacy database: %v", err)
	}

	migrated, err := Open()
	if err != nil {
		t.Fatalf("open migrated database: %v", err)
	}
	t.Cleanup(func() {
		_ = migrated.Close()
	})

	path, err := Path()
	if err != nil {
		t.Fatalf("resolve shared path: %v", err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("shared database was not created: %v", err)
	}

	loaded, err := migrated.LoadSession("legacy-1")
	if err != nil {
		t.Fatalf("load migrated session: %v", err)
	}
	if loaded.Title != "Legacy conversation" {
		t.Fatalf("unexpected migrated title: %q", loaded.Title)
	}
}
