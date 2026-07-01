package agentcli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/GordenArcher/axon-core/internal/ai"
)

type diagnosticsSnapshot struct {
	Workspace   string          `json:"workspace"`
	UpdatedAt   string          `json:"updatedAt"`
	Diagnostics []ai.Diagnostic `json:"diagnostics"`
}

// readDiagnosticsSnapshotForCurrentWorkspace loads the Problems snapshot that
// the open editor exports for `axon fix`. The workspace check is intentionally
// strict: a stale diagnostics file from another project should not let the CLI
// ask the agent to edit files in the wrong repository.
func readDiagnosticsSnapshotForCurrentWorkspace() (diagnosticsSnapshot, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return diagnosticsSnapshot{}, err
	}

	rawSnapshot, err := os.ReadFile(filepath.Join(home, ".axon", "diagnostics.json"))
	if err != nil {
		return diagnosticsSnapshot{}, fmt.Errorf("no diagnostics found -- open this project in Axon first")
	}

	var snapshot diagnosticsSnapshot
	if err := json.Unmarshal(rawSnapshot, &snapshot); err != nil {
		return diagnosticsSnapshot{}, err
	}
	if len(snapshot.Diagnostics) == 0 {
		return diagnosticsSnapshot{}, fmt.Errorf("no problems found in the open Axon workspace")
	}

	workspacePath, err := filepath.Abs(snapshot.Workspace)
	if err != nil {
		return diagnosticsSnapshot{}, err
	}
	currentPath, err := os.Getwd()
	if err != nil {
		return diagnosticsSnapshot{}, err
	}
	currentPath, err = filepath.Abs(currentPath)
	if err != nil {
		return diagnosticsSnapshot{}, err
	}
	relativePath, err := filepath.Rel(workspacePath, currentPath)
	if err != nil ||
		relativePath == ".." ||
		len(relativePath) >= 3 &&
			relativePath[:3] == ".."+string(os.PathSeparator) {
		return diagnosticsSnapshot{}, fmt.Errorf("diagnostics belong to %s, not %s -- open this project in Axon first", workspacePath, currentPath)
	}

	if snapshot.UpdatedAt != "" {
		if updatedAt, err := time.Parse(time.RFC3339, snapshot.UpdatedAt); err == nil && time.Since(updatedAt) > 30*time.Minute {
			fmt.Fprintln(os.Stderr, dim("Diagnostics are older than 30 minutes; continuing because the workspace still matches."))
		}
	}

	snapshot.Workspace = workspacePath
	return snapshot, nil
}

func readDiagnosticsSnapshotForWorkspace(workspace string) (diagnosticsSnapshot, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return diagnosticsSnapshot{}, err
	}

	rawSnapshot, err := os.ReadFile(filepath.Join(home, ".axon", "diagnostics.json"))
	if err != nil {
		return diagnosticsSnapshot{}, err
	}

	var snapshot diagnosticsSnapshot
	if err := json.Unmarshal(rawSnapshot, &snapshot); err != nil {
		return diagnosticsSnapshot{}, err
	}

	workspacePath, err := filepath.Abs(workspace)
	if err != nil {
		return diagnosticsSnapshot{}, err
	}
	snapshotWorkspace, err := filepath.Abs(snapshot.Workspace)
	if err != nil {
		return diagnosticsSnapshot{}, err
	}
	if snapshotWorkspace != workspacePath {
		return diagnosticsSnapshot{}, fmt.Errorf("diagnostics belong to %s, not %s", snapshotWorkspace, workspacePath)
	}

	snapshot.Workspace = snapshotWorkspace
	return snapshot, nil
}
