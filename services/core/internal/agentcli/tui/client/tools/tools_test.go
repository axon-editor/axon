// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package tools

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLocalDefinitionsExposeMutatingTools(t *testing.T) {
	names := map[string]bool{}
	for _, definition := range LocalDefinitions() {
		names[definition.Function.Name] = true
	}
	for _, expected := range []string{WriteFileTool, CreateDirectoryTool, RunCommandTool} {
		if !names[expected] {
			t.Fatalf("missing tool definition %q", expected)
		}
		if !NeedsApproval(expected) {
			t.Fatalf("%q should require approval", expected)
		}
	}
	if !IsWorkspaceTool("read_file") {
		t.Fatal("read_file should be a workspace tool")
	}
	if NeedsApproval("read_file") {
		t.Fatal("read_file should not require approval")
	}
}

func TestApprovalDetailsForCommand(t *testing.T) {
	summary, details, allowTurn := ApprovalDetails(
		RunCommandTool,
		json.RawMessage(`{"command":"go test ./...","description":"run tests"}`),
	)
	if summary != "go test ./..." {
		t.Fatalf("summary = %q", summary)
	}
	if !allowTurn {
		t.Fatal("commands should offer allow-for-run")
	}
	if !strings.Contains(details, "run tests") || !strings.Contains(details, "go test ./...") {
		t.Fatalf("details are incomplete: %q", details)
	}
}

func TestExecuteWriteFileWithoutCore(t *testing.T) {
	root := t.TempDir()
	result := Execute(context.Background(), "", root, WriteFileTool, json.RawMessage(
		`{"path":"note.txt","content":"hello"}`,
	))
	if !result.OK {
		t.Fatalf("write failed: %s", result.Content)
	}
	raw, err := os.ReadFile(filepath.Join(root, "note.txt"))
	if err != nil {
		t.Fatalf("read written file: %v", err)
	}
	if string(raw) != "hello" {
		t.Fatalf("file content = %q", raw)
	}
}
