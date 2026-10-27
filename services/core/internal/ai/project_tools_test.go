// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package ai

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunListFilesToolListsRequestedLevelBeforeNestedFiles(t *testing.T) {
	root := t.TempDir()
	writeToolTestFile(t, filepath.Join(root, "README.md"), "readme")
	writeToolTestFile(t, filepath.Join(root, "package.json"), "{}")
	writeToolTestFile(t, filepath.Join(root, "docs", "guide.md"), "guide")
	for index := 0; index < maxToolListEntries+10; index++ {
		writeToolTestFile(
			t,
			filepath.Join(root, "apps", fmt.Sprintf("file-%03d.ts", index)),
			"x",
		)
	}

	result := runListFilesTool(context.Background(), root, listFilesArgs{Path: ""})
	lines := strings.Split(result, "\n")

	if !strings.Contains(lines[0], "truncated") {
		t.Fatalf("large listing should say it was truncated, got %q", lines[0])
	}
	for _, expected := range []string{"README.md", "package.json", "apps/", "docs/"} {
		if toolTestLineIndex(lines, expected) < 0 {
			t.Fatalf("listing should contain requested-level entry %q:\n%s", expected, result)
		}
	}
	docsIndex := toolTestLineIndex(lines, "docs/")
	appsFileIndex := toolTestLineIndex(lines, "apps/file-000.ts")
	if docsIndex > appsFileIndex {
		t.Fatalf("requested level should be listed before nested app files:\n%s", result)
	}
}

func writeToolTestFile(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create test folder: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write test file: %v", err)
	}
}

func toolTestLineIndex(lines []string, target string) int {
	for index, line := range lines {
		if line == target {
			return index
		}
	}
	return -1
}
