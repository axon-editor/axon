// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package fs

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSearchWorkspaceOptionsSearchesRegexWithinGlob(t *testing.T) {
	root := t.TempDir()
	writeSearchTestFile(t, filepath.Join(root, "src", "main.go"), "package main\n\nfunc main() {}\n")
	writeSearchTestFile(t, filepath.Join(root, "src", "helper.ts"), "function main() {}\n")

	results, err := SearchWorkspaceOptions(context.Background(), root, SearchOptions{
		Pattern:    `func\s+main`,
		Regex:      true,
		Glob:       "**/*.go",
		TargetPath: root,
		MaxResults: 20,
	})
	if err != nil {
		t.Fatalf("SearchWorkspaceOptions failed: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected one Go match, got %#v", results)
	}
	if results[0].Path != filepath.Join(root, "src", "main.go") || results[0].Line != 3 {
		t.Fatalf("unexpected regex result: %#v", results[0])
	}
}

func TestSearchWorkspaceOptionsScopesToTargetFile(t *testing.T) {
	root := t.TempDir()
	mainPath := filepath.Join(root, "src", "main.go")
	writeSearchTestFile(t, mainPath, "needle\n")
	writeSearchTestFile(t, filepath.Join(root, "src", "helper.go"), "needle\n")

	results, err := SearchWorkspaceOptions(context.Background(), root, SearchOptions{
		Pattern:    "needle",
		TargetPath: mainPath,
		MaxResults: 20,
	})
	if err != nil {
		t.Fatalf("SearchWorkspaceOptions failed: %v", err)
	}
	if len(results) != 1 || results[0].Path != mainPath {
		t.Fatalf("expected only the target file, got %#v", results)
	}
}

func TestSearchWorkspaceOptionsHonorsCaseSensitivity(t *testing.T) {
	root := t.TempDir()
	writeSearchTestFile(t, filepath.Join(root, "main.go"), "Hello\n")

	insensitive, err := SearchWorkspaceOptions(context.Background(), root, SearchOptions{
		Pattern:    "hello",
		TargetPath: root,
		MaxResults: 20,
	})
	if err != nil {
		t.Fatalf("case-insensitive search failed: %v", err)
	}
	if len(insensitive) != 1 {
		t.Fatalf("expected case-insensitive match, got %#v", insensitive)
	}

	sensitive, err := SearchWorkspaceOptions(context.Background(), root, SearchOptions{
		Pattern:       "hello",
		CaseSensitive: true,
		TargetPath:    root,
		MaxResults:    20,
	})
	if err != nil {
		t.Fatalf("case-sensitive search failed: %v", err)
	}
	if len(sensitive) != 0 {
		t.Fatalf("expected case-sensitive search to skip Hello, got %#v", sensitive)
	}
}

func TestSearchWorkspaceOptionsRejectsPathOutsideWorkspace(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	writeSearchTestFile(t, filepath.Join(outside, "main.go"), "needle\n")

	_, err := SearchWorkspaceOptions(context.Background(), root, SearchOptions{
		Pattern:    "needle",
		TargetPath: filepath.Join(outside, "main.go"),
		MaxResults: 20,
	})
	if err == nil || !strings.Contains(err.Error(), "inside the workspace") {
		t.Fatalf("expected an out-of-workspace error, got %v", err)
	}
}

func TestSearchWorkspaceOptionsRejectsInvalidRegex(t *testing.T) {
	root := t.TempDir()
	writeSearchTestFile(t, filepath.Join(root, "main.go"), "needle\n")

	_, err := SearchWorkspaceOptions(context.Background(), root, SearchOptions{
		Pattern:    "[",
		Regex:      true,
		TargetPath: root,
		MaxResults: 20,
	})
	if err == nil {
		t.Fatal("expected invalid regex to return an error")
	}
}

func TestRipgrepOptionsArgumentsSupportAgentSearch(t *testing.T) {
	arguments := strings.Join(ripgrepOptionsArguments(SearchOptions{
		Pattern:       "func",
		Regex:         true,
		CaseSensitive: true,
		Glob:          "**/*.go",
		StableOrder:   true,
	}, "src"), " ")

	for _, expected := range []string{"--sort path", "--glob **/*.go", "-- func src"} {
		if !strings.Contains(arguments, expected) {
			t.Fatalf("expected agent search arguments to include %q: %s", expected, arguments)
		}
	}
	if strings.Contains(arguments, "--fixed-strings") {
		t.Fatalf("regex search must not pass --fixed-strings: %s", arguments)
	}
	if strings.Contains(arguments, "--ignore-case") {
		t.Fatalf("case-sensitive search must not pass --ignore-case: %s", arguments)
	}
}

func writeSearchTestFile(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create test folder: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write test file: %v", err)
	}
}
