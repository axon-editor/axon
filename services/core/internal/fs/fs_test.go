package fs

import (
	"errors"
	"fmt"
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

func TestSearchWorkspaceSkipsGoCaches(t *testing.T) {
	root := t.TempDir()

	sourceDir := filepath.Join(root, "src")
	dotGoCacheDir := filepath.Join(root, ".gocache", "ab")
	plainGoCacheDir := filepath.Join(root, "gocache", "cd")
	goBuildDir := filepath.Join(root, "go-build123", "ef")
	for _, dir := range []string{sourceDir, dotGoCacheDir, plainGoCacheDir, goBuildDir} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatalf("failed to create %s: %v", dir, err)
		}
	}

	sourcePath := filepath.Join(sourceDir, "main.go")
	if err := os.WriteFile(sourcePath, []byte("package main\nconst marker = \"axon-search\"\n"), 0644); err != nil {
		t.Fatalf("failed to write source file: %v", err)
	}

	cacheFiles := []string{
		filepath.Join(dotGoCacheDir, "cached.go"),
		filepath.Join(plainGoCacheDir, "cached.go"),
		filepath.Join(goBuildDir, "cached.go"),
	}
	for _, cachePath := range cacheFiles {
		if err := os.WriteFile(cachePath, []byte("const marker = \"axon-search\"\n"), 0644); err != nil {
			t.Fatalf("failed to write cache file %s: %v", cachePath, err)
		}
	}

	results, err := SearchWorkspace(root, "axon-search", 20)
	if err != nil {
		t.Fatalf("SearchWorkspace failed: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected only the source match, got %d results: %#v", len(results), results)
	}
	if results[0].Path != sourcePath {
		t.Fatalf("expected result path %s, got %s", sourcePath, results[0].Path)
	}
}

func TestSearchWorkspaceStopsAtResultLimit(t *testing.T) {
	root := t.TempDir()

	for index := 0; index < 20; index++ {
		filePath := filepath.Join(root, "src", fmt.Sprintf("file-%02d.go", index))
		if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
			t.Fatalf("failed to create source dir: %v", err)
		}
		if err := os.WriteFile(filePath, []byte("package main\nconst marker = \"fast-search\"\n"), 0644); err != nil {
			t.Fatalf("failed to write source file: %v", err)
		}
	}

	results, err := SearchWorkspace(root, "fast-search", 5)
	if err != nil {
		t.Fatalf("SearchWorkspace failed: %v", err)
	}
	if len(results) != 5 {
		t.Fatalf("expected exactly 5 capped results, got %d", len(results))
	}
}

func TestSearchWorkspaceSkipsBinaryExtensions(t *testing.T) {
	root := t.TempDir()

	textPath := filepath.Join(root, "src", "main.go")
	if err := os.MkdirAll(filepath.Dir(textPath), 0755); err != nil {
		t.Fatalf("failed to create source dir: %v", err)
	}
	if err := os.WriteFile(textPath, []byte("package main\nconst marker = \"binary-skip\"\n"), 0644); err != nil {
		t.Fatalf("failed to write source file: %v", err)
	}

	imagePath := filepath.Join(root, "public", "image.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0755); err != nil {
		t.Fatalf("failed to create public dir: %v", err)
	}
	if err := os.WriteFile(imagePath, []byte("binary-skip"), 0644); err != nil {
		t.Fatalf("failed to write binary-extension file: %v", err)
	}

	results, err := SearchWorkspace(root, "binary-skip", 20)
	if err != nil {
		t.Fatalf("SearchWorkspace failed: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected only the text match, got %d results: %#v", len(results), results)
	}
	if results[0].Path != textPath {
		t.Fatalf("expected result path %s, got %s", textPath, results[0].Path)
	}
}

func TestSearchWorkspaceSkipsBinaryContentWithoutExtension(t *testing.T) {
	root := t.TempDir()

	textPath := filepath.Join(root, "src", "main.go")
	if err := os.MkdirAll(filepath.Dir(textPath), 0755); err != nil {
		t.Fatalf("failed to create source dir: %v", err)
	}
	if err := os.WriteFile(textPath, []byte("package main\nconst marker = \"binary-content-skip\"\n"), 0644); err != nil {
		t.Fatalf("failed to write source file: %v", err)
	}

	binaryPath := filepath.Join(root, "tools", "axon-core")
	if err := os.MkdirAll(filepath.Dir(binaryPath), 0755); err != nil {
		t.Fatalf("failed to create tools dir: %v", err)
	}
	if err := os.WriteFile(binaryPath, []byte{'b', 'i', 'n', 'a', 'r', 'y', '-', 'c', 'o', 'n', 't', 'e', 'n', 't', '-', 's', 'k', 'i', 'p', 0x00}, 0644); err != nil {
		t.Fatalf("failed to write binary file: %v", err)
	}

	results, err := SearchWorkspace(root, "binary-content-skip", 20)
	if err != nil {
		t.Fatalf("SearchWorkspace failed: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected only the text match, got %d results: %#v", len(results), results)
	}
	if results[0].Path != textPath {
		t.Fatalf("expected result path %s, got %s", textPath, results[0].Path)
	}
}
