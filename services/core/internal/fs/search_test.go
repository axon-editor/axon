package fs

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestParseRipgrepMatchBuildsWorkspaceResult(t *testing.T) {
	root := t.TempDir()
	rawEvent := []byte(`{"type":"match","data":{"path":{"text":"src/main.go"},"lines":{"text":"  const marker = \"Axon Search\"\n"},"line_number":12,"submatches":[{"start":17,"end":28}]}}`)

	result, matched, err := parseRipgrepMatch(root, rawEvent)
	if err != nil {
		t.Fatalf("parseRipgrepMatch failed: %v", err)
	}
	if !matched {
		t.Fatal("expected a ripgrep match event")
	}
	if result.Path != filepath.Join(root, "src", "main.go") {
		t.Fatalf("unexpected result path: %s", result.Path)
	}
	if result.Line != 12 || result.Column != 18 || result.Preview != `const marker = "Axon Search"` {
		t.Fatalf("unexpected parsed result: %#v", result)
	}
}

func TestParseRipgrepMatchRejectsEscapedWorkspacePath(t *testing.T) {
	root := t.TempDir()
	rawEvent := []byte(`{"type":"match","data":{"path":{"text":"../outside.go"},"lines":{"text":"marker\n"},"line_number":1,"submatches":[{"start":0,"end":6}]}}`)

	if _, _, err := parseRipgrepMatch(root, rawEvent); err == nil {
		t.Fatal("expected an out-of-workspace ripgrep path to be rejected")
	}
}

func TestSearchWorkspaceUsesRipgrepJSONWhenAvailable(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("the fake ripgrep executable uses a POSIX shell")
	}

	root := t.TempDir()
	fakeRipgrepPath := filepath.Join(t.TempDir(), "rg")
	fakeRipgrep := `#!/bin/sh
printf '%s\n' '{"type":"match","data":{"path":{"text":"src/fast.go"},"lines":{"text":"const marker = \"accelerated\"\n"},"line_number":7,"submatches":[{"start":16,"end":27}]}}'
`
	if err := os.WriteFile(fakeRipgrepPath, []byte(fakeRipgrep), 0o755); err != nil {
		t.Fatalf("failed to create fake ripgrep: %v", err)
	}

	originalResolver := resolveRipgrepPath
	resolveRipgrepPath = func(string) (string, error) { return fakeRipgrepPath, nil }
	t.Cleanup(func() { resolveRipgrepPath = originalResolver })

	results, err := SearchWorkspace(root, "accelerated", 20)
	if err != nil {
		t.Fatalf("SearchWorkspace failed: %v", err)
	}
	if len(results) != 1 || results[0].Path != filepath.Join(root, "src", "fast.go") {
		t.Fatalf("expected the structured ripgrep result, got %#v", results)
	}
}

func TestSearchWorkspaceFallsBackWhenRipgrepIsUnavailable(t *testing.T) {
	root := t.TempDir()
	filePath := filepath.Join(root, "src", "fallback.go")
	if err := os.MkdirAll(filepath.Dir(filePath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filePath, []byte("const marker = \"walker-fallback\"\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	originalResolver := resolveRipgrepPath
	resolveRipgrepPath = func(string) (string, error) { return "", errors.New("rg not installed") }
	t.Cleanup(func() { resolveRipgrepPath = originalResolver })

	results, err := SearchWorkspace(root, "WALKER-FALLBACK", 20)
	if err != nil {
		t.Fatalf("SearchWorkspace fallback failed: %v", err)
	}
	if len(results) != 1 || results[0].Path != filePath {
		t.Fatalf("expected the Go walker result, got %#v", results)
	}
}

func TestSearchWorkspaceReturnsCancellationBeforeStartingRipgrep(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := SearchWorkspaceContext(ctx, t.TempDir(), "cancelled", 20)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context cancellation, got %v", err)
	}
}

func TestRipgrepArgumentsPreserveAxonSearchScope(t *testing.T) {
	arguments := strings.Join(ripgrepArguments("needle"), " ")
	for _, expected := range []string{"--json", "--fixed-strings", "--ignore-case", "--hidden", "--no-ignore", "!**/node_modules/**", "-- needle ."} {
		if !strings.Contains(arguments, expected) {
			t.Fatalf("expected ripgrep arguments to include %q: %s", expected, arguments)
		}
	}
}
