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

	result := runListFilesTool(context.Background(), root, listFilesArgs{
		Path:  "",
		Depth: 2,
		Limit: maxToolListEntries,
	})
	lines := strings.Split(result, "\n")

	if !strings.Contains(result, "More entries available") {
		t.Fatalf("large listing should advertise another page:\n%s", result)
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

func TestRunListFilesToolDefaultsToImmediateChildren(t *testing.T) {
	root := t.TempDir()
	writeToolTestFile(t, filepath.Join(root, "top.txt"), "top")
	writeToolTestFile(t, filepath.Join(root, "nested", "child.txt"), "child")

	immediate := runListFilesTool(context.Background(), root, listFilesArgs{Path: ""})
	if !strings.Contains(immediate, "nested/") || !strings.Contains(immediate, "top.txt") {
		t.Fatalf("default listing should contain immediate children:\n%s", immediate)
	}
	if strings.Contains(immediate, "nested/child.txt") {
		t.Fatalf("default listing should not recurse:\n%s", immediate)
	}

	nested := runListFilesTool(context.Background(), root, listFilesArgs{
		Path:  "",
		Depth: 2,
	})
	if !strings.Contains(nested, "nested/child.txt") {
		t.Fatalf("depth 2 listing should contain nested files:\n%s", nested)
	}
}

func TestRunListFilesToolPaginates(t *testing.T) {
	root := t.TempDir()
	writeToolTestFile(t, filepath.Join(root, "a.txt"), "a")
	writeToolTestFile(t, filepath.Join(root, "b.txt"), "b")
	writeToolTestFile(t, filepath.Join(root, "c.txt"), "c")

	result := runListFilesTool(context.Background(), root, listFilesArgs{
		Path:   "",
		Offset: 1,
		Limit:  1,
	})
	lines := strings.Split(result, "\n")

	if toolTestLineIndex(lines, "b.txt") < 0 {
		t.Fatalf("page should contain the second entry:\n%s", result)
	}
	for _, hidden := range []string{"a.txt", "c.txt"} {
		if toolTestLineIndex(lines, hidden) >= 0 {
			t.Fatalf("page should not contain %q:\n%s", hidden, result)
		}
	}
	if !strings.Contains(result, "offset=2") {
		t.Fatalf("page should point at the next offset:\n%s", result)
	}
}

func TestRunGlobToolFindsNestedFiles(t *testing.T) {
	root := t.TempDir()
	writeToolTestFile(t, filepath.Join(root, "apps", "editor", "main.go"), "package main")
	writeToolTestFile(t, filepath.Join(root, "services", "core", "main.go"), "package main")
	writeToolTestFile(t, filepath.Join(root, "tools", "main.go"), "package main")
	writeToolTestFile(t, filepath.Join(root, "README.md"), "readme")

	result := runGlobTool(context.Background(), root, globArgs{Pattern: "**/main.go"})
	for _, expected := range []string{"apps/editor/main.go", "services/core/main.go"} {
		if !strings.Contains(result, expected) {
			t.Fatalf("glob should contain %q:\n%s", expected, result)
		}
	}
	if strings.Contains(result, "README.md") {
		t.Fatalf("glob should not contain unrelated files:\n%s", result)
	}

	page := runGlobTool(context.Background(), root, globArgs{
		Pattern: "*main.go",
		Offset:  1,
		Limit:   1,
	})
	if !strings.Contains(page, "services/core/main.go") {
		t.Fatalf("second glob page should contain the second match:\n%s", page)
	}
	if strings.Contains(page, "apps/editor/main.go") {
		t.Fatalf("second glob page should not repeat the first match:\n%s", page)
	}
	if !strings.Contains(page, "offset=2") {
		t.Fatalf("glob page should point at the next offset:\n%s", page)
	}
}

func TestRunGrepToolSearchesRegexWithinGlob(t *testing.T) {
	root := t.TempDir()
	writeToolTestFile(t, filepath.Join(root, "src", "main.go"), "package main\n\nfunc main() {}\n")
	writeToolTestFile(t, filepath.Join(root, "src", "helper.ts"), "function main() {}\n")
	writeToolTestFile(t, filepath.Join(root, "src", "notes.md"), "func main is documented\n")

	result := runGrepTool(context.Background(), root, grepArgs{
		Pattern: `func\s+main`,
		Glob:    "**/*.go",
	})
	if !strings.Contains(result, "src/main.go:3:1:") {
		t.Fatalf("grep should return the matching Go line:\n%s", result)
	}
	for _, unexpected := range []string{"helper.ts", "notes.md"} {
		if strings.Contains(result, unexpected) {
			t.Fatalf("glob should exclude %q:\n%s", unexpected, result)
		}
	}
}

func TestRunGrepToolHonorsCaseSensitivityAndPagination(t *testing.T) {
	root := t.TempDir()
	writeToolTestFile(t, filepath.Join(root, "Case.go"), "package main\n\nconst greeting = \"Hello\"\n")
	writeToolTestFile(t, filepath.Join(root, "many.txt"), "match one\nmatch two\nmatch three\n")

	insensitive := runGrepTool(context.Background(), root, grepArgs{
		Pattern: "hello",
		Glob:    "**/Case.go",
	})
	if !strings.Contains(insensitive, "Case.go:3:") {
		t.Fatalf("default grep should ignore case:\n%s", insensitive)
	}

	sensitive := runGrepTool(context.Background(), root, grepArgs{
		Pattern:       "hello",
		Glob:          "**/Case.go",
		CaseSensitive: true,
	})
	if !strings.Contains(sensitive, "found no matches") {
		t.Fatalf("case-sensitive grep should not match Hello:\n%s", sensitive)
	}

	page := runGrepTool(context.Background(), root, grepArgs{
		Pattern: "match",
		Glob:    "**/many.txt",
		Offset:  1,
		Limit:   1,
	})
	if !strings.Contains(page, "many.txt:2:") {
		t.Fatalf("grep page should contain the second match:\n%s", page)
	}
	for _, unexpected := range []string{"many.txt:1:", "many.txt:3:"} {
		if strings.Contains(page, unexpected) {
			t.Fatalf("grep page should not contain %q:\n%s", unexpected, page)
		}
	}
	if !strings.Contains(page, "offset=2") {
		t.Fatalf("grep page should point at the next offset:\n%s", page)
	}
}

func TestRunGrepToolRejectsInvalidRegex(t *testing.T) {
	root := t.TempDir()
	writeToolTestFile(t, filepath.Join(root, "main.go"), "package main\n")

	result := runGrepTool(context.Background(), root, grepArgs{Pattern: "["})
	if !strings.Contains(result, "grep failed:") {
		t.Fatalf("invalid regex should fail with a useful message:\n%s", result)
	}
}

func TestRunSearchProjectToolKeepsLiteralAliasWorking(t *testing.T) {
	root := t.TempDir()
	writeToolTestFile(t, filepath.Join(root, "src", "main.go"), "package main\n\nfunc main() {}\n")

	result := runSearchProjectTool(context.Background(), root, searchProjectArgs{Query: "func main"})
	if !strings.Contains(result, "grep results") || !strings.Contains(result, "src/main.go:3:") {
		t.Fatalf("search_project alias should use the grep implementation:\n%s", result)
	}
}

func TestRunReadFileToolReturnsLineRange(t *testing.T) {
	root := t.TempDir()
	var content strings.Builder
	for line := 1; line <= 10; line++ {
		if line > 1 {
			content.WriteByte('\n')
		}
		fmt.Fprintf(&content, "line%d", line)
	}
	writeToolTestFile(t, filepath.Join(root, "notes.txt"), content.String())

	result := runReadFileTool(root, readFileArgs{
		Path:   "notes.txt",
		Offset: 3,
		Limit:  2,
	})
	for _, expected := range []string{"3: line3", "4: line4", "offset=5"} {
		if !strings.Contains(result, expected) {
			t.Fatalf("line range should contain %q:\n%s", expected, result)
		}
	}
	if strings.Contains(result, "5: line5") {
		t.Fatalf("line range should stop after the limit:\n%s", result)
	}

	pastEnd := runReadFileTool(root, readFileArgs{
		Path:   "notes.txt",
		Offset: 20,
	})
	if !strings.Contains(pastEnd, "past the end") || !strings.Contains(pastEnd, "10 lines") {
		t.Fatalf("past-end read should explain the file length:\n%s", pastEnd)
	}
}

func TestRunReadFileToolHandlesEmptyFile(t *testing.T) {
	root := t.TempDir()
	writeToolTestFile(t, filepath.Join(root, "empty.txt"), "")

	result := runReadFileTool(root, readFileArgs{Path: "empty.txt"})
	if !strings.Contains(result, "(empty file)") {
		t.Fatalf("empty file should return an explicit empty result:\n%s", result)
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
