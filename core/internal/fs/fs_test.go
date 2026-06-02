package fs

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func childNames(node FileNode) map[string]bool {
	names := make(map[string]bool)
	for _, child := range node.Children {
		names[child.Name] = true
	}
	return names
}

func TestGetTreeShowsProjectDotfiles(t *testing.T) {
	root := t.TempDir()

	entries := []string{
		".github",
		".vscode",
		".env",
		".gitignore",
		"node_modules",
		"dist",
		"release",
		"src",
	}

	for _, entry := range entries {
		target := filepath.Join(root, entry)
		if filepath.Ext(entry) == "" && entry != ".env" && entry != ".gitignore" {
			if err := os.Mkdir(target, 0755); err != nil {
				t.Fatalf("failed to create %s: %v", entry, err)
			}
			continue
		}

		if err := os.WriteFile(target, []byte("value"), 0644); err != nil {
			t.Fatalf("failed to create %s: %v", entry, err)
		}
	}

	tree, err := GetTree(root)
	if err != nil {
		t.Fatalf("GetTree failed: %v", err)
	}

	names := childNames(tree)
	for _, entry := range entries {
		if !names[entry] {
			t.Fatalf("expected %s to be visible in the file tree", entry)
		}
	}
}

func TestGetTreeSkipsGeneratedNoise(t *testing.T) {
	root := t.TempDir()

	skippedEntries := []string{
		".git",
	}

	for _, entry := range skippedEntries {
		if err := os.Mkdir(filepath.Join(root, entry), 0755); err != nil {
			t.Fatalf("failed to create %s: %v", entry, err)
		}
	}
	if err := os.WriteFile(filepath.Join(root, ".DS_Store"), []byte("noise"), 0644); err != nil {
		t.Fatalf("failed to create .DS_Store: %v", err)
	}

	tree, err := GetTree(root)
	if err != nil {
		t.Fatalf("GetTree failed: %v", err)
	}

	names := childNames(tree)
	for _, entry := range append(skippedEntries, ".DS_Store") {
		if names[entry] {
			t.Fatalf("expected %s to be skipped from the file tree", entry)
		}
	}
}

func TestReadFileRejectsBinaryContent(t *testing.T) {
	root := t.TempDir()
	binaryPath := filepath.Join(root, "axon-core")

	if err := os.WriteFile(binaryPath, []byte{0x7f, 'E', 'L', 'F', 0x00, 0x01}, 0644); err != nil {
		t.Fatalf("failed to write binary test file: %v", err)
	}

	if _, err := ReadFile(binaryPath); !errors.Is(err, ErrBinaryFile) {
		t.Fatalf("expected ErrBinaryFile, got %v", err)
	}
}

func TestReadFileAllowsUtf8Text(t *testing.T) {
	root := t.TempDir()
	textPath := filepath.Join(root, "main.go")

	if err := os.WriteFile(textPath, []byte("package main\n"), 0644); err != nil {
		t.Fatalf("failed to write text test file: %v", err)
	}

	content, err := ReadFile(textPath)
	if err != nil {
		t.Fatalf("ReadFile returned error for text file: %v", err)
	}
	if content.Content != "package main\n" {
		t.Fatalf("unexpected content: %q", content.Content)
	}
}
