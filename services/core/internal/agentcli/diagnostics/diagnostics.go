// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package diagnostics

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/GordenArcher/axon-core/internal/ai"

	"github.com/GordenArcher/axon-core/internal/agentcli/colors"
)

type DiagnosticsSnapshot struct {
	Workspace   string          `json:"workspace"`
	UpdatedAt   string          `json:"updatedAt"`
	Diagnostics []ai.Diagnostic `json:"diagnostics"`
}

// readDiagnosticsSnapshotForCurrentWorkspace loads the Problems snapshot that
// the open editor exports for `axon fix`. The workspace check is intentionally
// strict: a stale diagnostics file from another project should not let the CLI
// ask the agent to edit files in the wrong repository.
func ReadDiagnosticsSnapshotForCurrentWorkspace() (DiagnosticsSnapshot, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return DiagnosticsSnapshot{}, err
	}

	rawSnapshot, err := os.ReadFile(filepath.Join(home, ".axon", "diagnostics.json"))
	if err != nil {
		return DiagnosticsSnapshot{}, fmt.Errorf("no diagnostics found -- open this project in Axon first")
	}

	var snapshot DiagnosticsSnapshot
	if err := json.Unmarshal(rawSnapshot, &snapshot); err != nil {
		return DiagnosticsSnapshot{}, err
	}
	if len(snapshot.Diagnostics) == 0 {
		return DiagnosticsSnapshot{}, fmt.Errorf("no problems found in the open Axon workspace")
	}

	workspacePath, err := filepath.Abs(snapshot.Workspace)
	if err != nil {
		return DiagnosticsSnapshot{}, err
	}
	currentPath, err := os.Getwd()
	if err != nil {
		return DiagnosticsSnapshot{}, err
	}
	currentPath, err = filepath.Abs(currentPath)
	if err != nil {
		return DiagnosticsSnapshot{}, err
	}
	relativePath, err := filepath.Rel(workspacePath, currentPath)
	if err != nil ||
		relativePath == ".." ||
		len(relativePath) >= 3 &&
			relativePath[:3] == ".."+string(os.PathSeparator) {
		return DiagnosticsSnapshot{}, fmt.Errorf("diagnostics belong to %s, not %s -- open this project in Axon first", workspacePath, currentPath)
	}

	if snapshot.UpdatedAt != "" {
		if updatedAt, err := time.Parse(time.RFC3339, snapshot.UpdatedAt); err == nil && time.Since(updatedAt) > 30*time.Minute {
			fmt.Fprintln(os.Stderr, colors.Dim("Diagnostics are older than 30 minutes; continuing because the workspace still matches."))
		}
	}

	snapshot.Workspace = workspacePath
	return snapshot, nil
}

func ReadDiagnosticsSnapshotForWorkspace(workspace string) (DiagnosticsSnapshot, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return DiagnosticsSnapshot{}, err
	}

	rawSnapshot, err := os.ReadFile(filepath.Join(home, ".axon", "diagnostics.json"))
	if err != nil {
		return DiagnosticsSnapshot{}, err
	}

	var snapshot DiagnosticsSnapshot
	if err := json.Unmarshal(rawSnapshot, &snapshot); err != nil {
		return DiagnosticsSnapshot{}, err
	}

	workspacePath, err := filepath.Abs(workspace)
	if err != nil {
		return DiagnosticsSnapshot{}, err
	}
	snapshotWorkspace, err := filepath.Abs(snapshot.Workspace)
	if err != nil {
		return DiagnosticsSnapshot{}, err
	}
	if snapshotWorkspace != workspacePath {
		return DiagnosticsSnapshot{}, fmt.Errorf("diagnostics belong to %s, not %s", snapshotWorkspace, workspacePath)
	}

	snapshot.Workspace = snapshotWorkspace
	return snapshot, nil
}
