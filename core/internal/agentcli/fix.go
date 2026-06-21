package agentcli

import (
	"context"
	"fmt"
	"os"
	"time"
)

// runFix is the terminal version of the Problems-to-edit loop. It reads the
// diagnostics Axon already shows, asks the local agent for a concrete edit
// proposal, applies that proposal to disk, and relies on the editor watcher/LSP
// pipeline to refresh the UI after the files change.
func runFix(args []string) int {
	if len(args) > 0 {
		fmt.Fprintln(os.Stderr, red("Usage: axon fix"))
		return 1
	}

	snapshot, err := readDiagnosticsSnapshotForCurrentWorkspace()
	if err != nil {
		fmt.Fprintln(os.Stderr, red(err.Error()))
		return 1
	}

	fmt.Fprintf(os.Stderr, "%s\n", dim(fmt.Sprintf("Reading %d problem(s) from Axon...", len(snapshot.Diagnostics))))

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	response, err := streamAgentRequest(ctx, streamRequestInput{
		Action:      "fix-problem",
		Prompt:      "Fix the most important current diagnostic. Return an editProposal JSON block with full replacement file content for every changed file.",
		FolderPath:  snapshot.Workspace,
		Diagnostics: snapshot.Diagnostics,
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, red(err.Error()))
		return 1
	}

	proposal, err := extractEditProposal(response)
	if err != nil {
		fmt.Fprintln(os.Stderr, red(err.Error()))
		return 1
	}
	if err := applyEditProposal(snapshot.Workspace, proposal); err != nil {
		fmt.Fprintln(os.Stderr, red(err.Error()))
		return 1
	}

	fmt.Fprintf(os.Stderr, "%s\n", dim("Done. Axon will refresh diagnostics from the changed files."))
	return 0
}
