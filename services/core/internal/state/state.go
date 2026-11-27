// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package state

import (
	"os"
	"path/filepath"
	"strings"
)

// Dir is the single root for state shared by the desktop app, the Go core, and
// the terminal CLI. Development keeps its own root so the two channels cannot
// overwrite each other's core identity, conversation history, or agent config.
//
// AXON_STATE_DIR wins because the desktop app passes it to every child process
// it spawns. Without it, NODE_ENV identifies a development launch, which covers
// cores and CLIs started by the dev runner or from Axon's integrated terminal.
func Dir() string {
	if override := strings.TrimSpace(os.Getenv("AXON_STATE_DIR")); override != "" {
		return override
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return ".axon"
	}
	if strings.TrimSpace(os.Getenv("NODE_ENV")) == "development" {
		return filepath.Join(home, ".axon-dev")
	}
	return filepath.Join(home, ".axon")
}

func Path(parts ...string) string {
	segments := make([]string, 0, len(parts)+1)
	segments = append(segments, Dir())
	segments = append(segments, parts...)
	return filepath.Join(segments...)
}
