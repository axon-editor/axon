// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package command

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client/tools/workspace"
)

const (
	// Build and test commands on a large project can take a while, but the
	// terminal must not hang forever if the process waits on stdin.
	commandTimeout = 2 * time.Minute
	outputLimit    = 32 * 1024
)

// Run executes an approved shell command inside the workspace. Output is capped
// to the tail because build errors and failing tests are the useful part.
func Run(
	ctx context.Context,
	root string,
	command string,
	description string,
	cwd string,
) (string, bool) {
	command = strings.TrimSpace(command)
	if command == "" {
		return "run_command failed: command is required", false
	}
	if strings.TrimSpace(description) == "" {
		return "run_command failed: description is required", false
	}

	workdir := root
	if strings.TrimSpace(cwd) != "" {
		resolved, err := workspace.Resolve(root, cwd)
		if err != nil {
			return "run_command failed: " + err.Error(), false
		}
		workdir = resolved
	}

	runContext, cancel := context.WithTimeout(ctx, commandTimeout)
	defer cancel()

	var process *exec.Cmd
	if runtime.GOOS == "windows" {
		process = exec.CommandContext(runContext, "cmd", "/C", command)
	} else {
		process = exec.CommandContext(runContext, "sh", "-lc", command)
	}
	process.Dir = workdir

	output := &tailBuffer{limit: outputLimit}
	process.Stdout = output
	process.Stderr = output

	err := process.Run()
	text := strings.TrimSpace(output.String())
	if text == "" {
		text = "(no output)"
	}

	if errors.Is(runContext.Err(), context.DeadlineExceeded) {
		return fmt.Sprintf("run_command timed out after %s\n\n%s", commandTimeout, text), false
	}
	if err != nil {
		var exitError *exec.ExitError
		if errors.As(err, &exitError) {
			return fmt.Sprintf("run_command exited with code %d\n\n%s", exitError.ExitCode(), text), false
		}
		return "run_command failed: " + err.Error(), false
	}
	return text, true
}

type tailBuffer struct {
	limit int
	data  []byte
}

func (b *tailBuffer) Write(value []byte) (int, error) {
	b.data = append(b.data, value...)
	if len(b.data) > b.limit {
		b.data = b.data[len(b.data)-b.limit:]
	}
	return len(value), nil
}

func (b *tailBuffer) String() string {
	return string(b.data)
}
