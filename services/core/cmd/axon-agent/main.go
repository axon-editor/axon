package main

import (
	"os"

	"github.com/GordenArcher/axon-core/internal/agentcli"
)

func main() {
	// The source folder is named axon-agent so it stays separate from the
	// existing axon-core server command, but release builds compile this entry
	// point as the user-facing `axon` binary. Keeping that split lets the
	// terminal companion grow without renaming the backend command or confusing
	// the packaged app startup path.
	os.Exit(agentcli.Run(os.Args[1:]))
}
