// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package workspace

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveRejectsEscapes(t *testing.T) {
	root := t.TempDir()
	if _, err := Resolve(root, "../outside.txt"); err == nil {
		t.Fatal("expected a parent traversal to be rejected")
	}
	if _, err := Resolve(root, filepath.Join(root, "..", "outside.txt")); err == nil {
		t.Fatal("expected an absolute escape to be rejected")
	}
}

func TestResolveRejectsSymlinkEscape(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	link := filepath.Join(root, "linked")
	if err := os.Symlink(outside, link); err != nil {
		t.Skipf("symlinks are unavailable: %v", err)
	}
	if _, err := Resolve(root, filepath.Join("linked", "file.txt")); err == nil {
		t.Fatal("expected a symlink escape to be rejected")
	}
}

func TestWriteFileCreatesParents(t *testing.T) {
	root := t.TempDir()
	content, ok := WriteFile(root, "nested/note.txt", "hello")
	if !ok {
		t.Fatalf("write failed: %s", content)
	}
	raw, err := os.ReadFile(filepath.Join(root, "nested", "note.txt"))
	if err != nil {
		t.Fatalf("read written file: %v", err)
	}
	if string(raw) != "hello" {
		t.Fatalf("file content = %q", raw)
	}
	if !strings.Contains(content, "nested/note.txt") {
		t.Fatalf("write result is missing the path: %q", content)
	}
}

func TestCreateDirectory(t *testing.T) {
	root := t.TempDir()
	content, ok := CreateDirectory(root, "one/two")
	if !ok {
		t.Fatalf("create directory failed: %s", content)
	}
	info, err := os.Stat(filepath.Join(root, "one", "two"))
	if err != nil || !info.IsDir() {
		t.Fatalf("directory was not created: %v", err)
	}
}
