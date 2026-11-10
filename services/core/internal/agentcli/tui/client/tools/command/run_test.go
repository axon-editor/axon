// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package command

import (
	"context"
	"strings"
	"testing"
)

func TestRunCapturesOutput(t *testing.T) {
	content, ok := Run(context.Background(), t.TempDir(), "echo axon", "verify output", "")
	if !ok {
		t.Fatalf("command failed: %s", content)
	}
	if !strings.Contains(content, "axon") {
		t.Fatalf("command output is missing: %q", content)
	}
}

func TestRunReportsExitCode(t *testing.T) {
	content, ok := Run(context.Background(), t.TempDir(), "exit 7", "verify failure", "")
	if ok {
		t.Fatalf("expected a failed command, got %q", content)
	}
	if !strings.Contains(content, "code 7") {
		t.Fatalf("exit code is missing: %q", content)
	}
}
