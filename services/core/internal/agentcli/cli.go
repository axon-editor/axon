package agentcli

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/terminalui"
	"github.com/GordenArcher/axon-core/internal/ai"
)

// Run is the small command router for the shipped `axon` binary.
// This stays intentionally lightweight instead of pulling in a CLI framework:
// startup stays fast, and the binary remains safe to ship beside axon-core
// without adding another dependency surface.
func Run(args []string) int {
	if len(args) == 0 {
		return runSession(nil)
	}

	switch args[0] {
	case "help", "--help", "-h":
		printCommandBanner(args)
		printHelp()
		return 0
	case "ask":
		if len(args) > 1 {
			printCommandBanner(args)
		}
		return runAsk(args[1:])
	case "resume":
		printCommandBanner(args)
		return runResume(args[1:])
	case "commit":
		printCommandBanner(args)
		return runCommit(args[1:])
	case "fix":
		printCommandBanner(args)
		return runFix(args[1:])
	default:
		// Any unknown first argument is treated as a path, matching the expected
		// `axon .` and `axon /path/to/project` workflow. This makes opening a
		// folder the shortest path through the command instead of hiding it
		// behind a subcommand users have to remember.
		//
		// I intentionally keep this path quiet on success. `axon .` is closer to
		// `code .` than an agent conversation: the terminal command is only a
		// handoff into the desktop app, so printing the animated agent banner and
		// workspace path makes normal project opening feel noisy without adding
		// useful information. Errors still print below, where the user can act on
		// them.
		if err := openInEditor(args[0]); err != nil {
			fmt.Fprintln(os.Stderr, red(err.Error()))
			return 1
		}
		return 0
	}
}

func runSession(args []string) int {
	workspace, err := os.Getwd()
	if err != nil {
		fmt.Fprintln(os.Stderr, red(err.Error()))
		return 1
	}

	workspace, err = normalizeWorkspacePath(workspace)
	if err != nil {
		fmt.Fprintln(os.Stderr, red(err.Error()))
		return 1
	}

	if len(args) > 0 && strings.TrimSpace(args[0]) != "" {
		sessionID := strings.TrimSpace(strings.TrimPrefix(args[0], ":"))
		session, err := findWorkspaceSession(workspace, sessionID)
		if err != nil {
			fmt.Fprintln(os.Stderr, red(err.Error()))
			return 1
		}
		if session != nil {
			loaded := newAgentTerminalSession(
				workspace,
				append([]ai.ConversationMessage(nil), session.Conversation...),
				session.ID,
			)
			if createdAt, err := time.Parse(time.RFC3339, session.CreatedAt); err == nil {
				loaded.createdAt = createdAt
			}
			if updatedAt, err := time.Parse(time.RFC3339, session.UpdatedAt); err == nil {
				loaded.updatedAt = updatedAt
			}
			return runTerminalSession(workspace, &loaded)
		}
		fmt.Fprintln(os.Stderr, red("No session found with that id in this workspace."))
		return printSessionList(workspace)
	}

	return runTerminalSession(workspace, nil)
}

func printCommandBanner(args []string) {
	mode := "Local agent ready"
	if len(args) > 0 {
		switch args[0] {
		case "help", "--help", "-h":
			mode = "Command reference"
		case "ask":
			mode = "One-shot agent request"
			if len(args) == 1 {
				mode = "Local agent ready"
			}
		case "resume":
			mode = "Resume an agent session"
		case "commit":
			mode = "Draft a commit from the staged diff"
		case "fix":
			mode = "Fix current Axon Problems"
		default:
			mode = "Opening workspace in Axon"
		}
	}

	workspace, err := os.Getwd()
	if err != nil {
		terminalui.PrintStartupBanner(os.Stdout, terminalui.BannerOptions{Mode: mode})
		return
	}
	terminalui.PrintStartupBanner(os.Stdout, terminalui.BannerOptions{
		Mode:      mode,
		Workspace: workspace,
	})
}

// runAsk joins the remaining arguments into one prompt so users can type the
// natural terminal form: `axon ask why is this slow`. A finite command timeout
// protects the shell from a stuck local model request while still giving slower
// machines enough time to load and answer.
func runAsk(args []string) int {
	prompt := strings.TrimSpace(strings.Join(args, " "))
	if prompt == "" {
		return runSession(nil)
	}

	// Slash-prefixed prompts are local terminal commands, not model requests.
	// This mirrors the Codex/Claude Code style the user asked for: the CLI can
	// expose fast commands like `/models` without paying the cost of a stream
	// round-trip or polluting the conversation with tool output.
	if handled, exitCode := runSlashCommand(prompt); handled {
		return exitCode
	}

	workspace, err := os.Getwd()
	if err != nil {
		fmt.Fprintln(os.Stderr, red(err.Error()))
		return 1
	}
	workspace, err = normalizeWorkspacePath(workspace)
	if err != nil {
		fmt.Fprintln(os.Stderr, red(err.Error()))
		return 1
	}

	return runOneShotSession(workspace, prompt)
}

// printHelp uses the installed command name, not the source directory name.
// That distinction matters because the code lives under cmd/axon-agent for
// separation, but the product experience must be the clean `axon` command.
func printHelp() {
	fmt.Println(`Axon Agent

Usage:
  axon                         start a new terminal conversation
  axon .                       open the current directory in Axon
  axon /path/to/project         open a project in Axon
  axon ask "why is X slow"      ask a one-shot question
  axon ask                     start a terminal conversation
  axon ask /models              list local Axon models without calling the agent
  axon resume                  list saved conversations for the current workspace
  axon resume :conversation     reopen a saved terminal conversation
  axon fix                      fix current Problems from the open editor
  axon commit                   draft a commit message from staged diff`)
}
