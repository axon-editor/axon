package agentcli

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"
)

// Run is the small command router for the shipped `axon` binary.
// I keep this intentionally lightweight instead of pulling in a CLI framework
// because M1 only needs open, ask, commit, and help. That keeps startup fast
// and makes the binary safer to ship beside axon-core without adding another
// dependency surface.
func Run(args []string) int {
	if len(args) == 0 {
		printHelp()
		return 0
	}

	switch args[0] {
	case "help", "--help", "-h":
		printHelp()
		return 0
	case "ask":
		return runAsk(args[1:])
	case "commit":
		return runCommit(args[1:])
	default:
		// Any unknown first argument is treated as a path, matching the expected
		// `axon .` and `axon /path/to/project` workflow. This makes opening a
		// folder the shortest path through the command instead of hiding it
		// behind a subcommand users have to remember.
		if err := openInEditor(args[0]); err != nil {
			fmt.Fprintln(os.Stderr, red(err.Error()))
			return 1
		}
		return 0
	}
}

// runAsk joins the remaining arguments into one prompt so users can type the
// natural terminal form: `axon ask why is this slow`. A finite command timeout
// protects the shell from a stuck local model request while still giving slower
// machines enough time to load and answer.
func runAsk(args []string) int {
	prompt := strings.TrimSpace(strings.Join(args, " "))
	if prompt == "" {
		fmt.Fprintln(os.Stderr, red("Usage: axon ask \"why is this slow?\""))
		return 1
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	if _, err := streamAgentRequest(ctx, streamRequestInput{
		Action: "ask",
		Prompt: prompt,
	}); err != nil {
		fmt.Fprintln(os.Stderr, red(err.Error()))
		return 1
	}
	return 0
}

// printHelp uses the installed command name, not the source directory name.
// That distinction matters because the code lives under cmd/axon-agent for
// separation, but the product experience must be the clean `axon` command.
func printHelp() {
	fmt.Println(`Axon Agent

Usage:
  axon .                       open the current directory in Axon
  axon /path/to/project         open a project in Axon
  axon ask "why is X slow"      stream an answer about the codebase
  axon commit                   draft a commit message from staged diff`)
}
