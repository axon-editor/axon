package server

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestValidateWorkspacePathAllowsExistingFileInsideWorkspace(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "src", "main.go")
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("package main\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := validateWorkspacePath(root, target); err != nil {
		t.Fatalf("expected path inside workspace to be allowed: %v", err)
	}
}

func TestValidateWorkspacePathRejectsParentTraversal(t *testing.T) {
	root := t.TempDir()
	outside := filepath.Join(filepath.Dir(root), "outside.txt")

	if err := validateWorkspacePath(root, outside); err == nil {
		t.Fatal("expected path outside workspace to be rejected")
	}
}

func TestValidateWorkspacePathRejectsExistingSymlinkEscape(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation requires elevated privileges on some Windows setups")
	}

	root := t.TempDir()
	outsideDir := t.TempDir()
	outsideFile := filepath.Join(outsideDir, "secret.txt")
	if err := os.WriteFile(outsideFile, []byte("secret"), 0o644); err != nil {
		t.Fatal(err)
	}
	linkPath := filepath.Join(root, "linked-secret.txt")
	if err := os.Symlink(outsideFile, linkPath); err != nil {
		t.Fatal(err)
	}

	if err := validateWorkspacePath(root, linkPath); err == nil {
		t.Fatal("expected symlink target outside workspace to be rejected")
	}
}

func TestValidateWorkspacePathRejectsNewFileUnderSymlinkedDirectoryEscape(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation requires elevated privileges on some Windows setups")
	}

	root := t.TempDir()
	outsideDir := t.TempDir()
	linkDir := filepath.Join(root, "external")
	if err := os.Symlink(outsideDir, linkDir); err != nil {
		t.Fatal(err)
	}

	target := filepath.Join(linkDir, "new-file.txt")
	if err := validateWorkspacePath(root, target); err == nil {
		t.Fatal("expected new file under symlinked outside directory to be rejected")
	}
}
