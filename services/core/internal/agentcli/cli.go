// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package agentcli

import (
	"fmt"
	"os"
	"runtime/debug"
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/start"
	"github.com/GordenArcher/axon-core/internal/agentcli/workspacepath"
)

// Run is the command router for the shipped `axon` binary. The product
// experience is the full-screen TUI: a bare invocation starts it in the current
// directory, and a path starts it in that project. `gui` is the explicit handoff
// back to the desktop editor.
func Run(args []string) int {
	if len(args) == 0 {
		return runTUI("")
	}

	switch args[0] {
	case "help", "--help", "-h":
		printHelp()
		return 0
	case "version", "--version", "-v":
		printVersion()
		return 0
	case "gui":
		return runGUI(args[1:])
	default:
		if strings.HasPrefix(args[0], "-") {
			fmt.Fprintln(os.Stderr, "Unknown option:", args[0])
			printHelp()
			return 1
		}
		return runTUI(args[0])
	}
}

func runTUI(path string) int {
	workspace, err := workspaceFor(path)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	return start.Run(workspace)
}

func runGUI(args []string) int {
	path := "."
	if len(args) > 0 {
		path = args[0]
	}
	if err := openInEditor(path); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	return 0
}

func workspaceFor(path string) (string, error) {
	target := strings.TrimSpace(path)
	if target == "" {
		workingDirectory, err := os.Getwd()
		if err != nil {
			return "", err
		}
		target = workingDirectory
	}
	return workspacepath.NormalizeWorkspacePath(target)
}

func printVersion() {
	version := "dev"
	if info, ok := debug.ReadBuildInfo(); ok &&
		info.Main.Version != "" &&
		info.Main.Version != "(devel)" {
		version = info.Main.Version
	}
	fmt.Printf("axon %s\n", version)
}

func printHelp() {
	fmt.Println(`Axon Agent

Usage:
  axon                         start the agent TUI in the current directory
  axon /path/to/project        start the agent TUI in a project
  axon gui                     open the current directory in the Axon editor
  axon gui /path/to/project    open a project in the Axon editor
  axon help                    show this help
  axon version                 print the CLI version

Keys inside the TUI:
  Enter          send
  Shift+Enter    newline
  Esc            cancel the current response
  Ctrl+C         quit
  PgUp/PgDn      scroll the transcript`)
}
