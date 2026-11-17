// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package safepath

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveExistingKeepsMissingSuffix(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "new", "nested", "file.txt")
	resolved, err := ResolveExisting(target)
	if err != nil {
		t.Fatalf("resolve existing: %v", err)
	}
	resolvedRoot, err := ResolveExisting(root)
	if err != nil {
		t.Fatalf("resolve root: %v", err)
	}
	if !Inside(resolvedRoot, resolved) {
		t.Fatalf("resolved path escaped root: %q", resolved)
	}
	if filepath.Base(resolved) != "file.txt" {
		t.Fatalf("resolved leaf = %q", resolved)
	}
}

func TestResolveExistingDetectsSymlinkEscape(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	link := filepath.Join(root, "escape")
	if err := os.Symlink(outside, link); err != nil {
		t.Skipf("symlinks are unavailable: %v", err)
	}

	resolvedRoot, err := ResolveExisting(root)
	if err != nil {
		t.Fatalf("resolve root: %v", err)
	}
	resolvedLink, err := ResolveExisting(filepath.Join(link, "file.txt"))
	if err != nil {
		t.Fatalf("resolve link: %v", err)
	}
	if Inside(resolvedRoot, resolvedLink) {
		t.Fatalf("symlink escape was accepted: %q", resolvedLink)
	}
}
