// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package composer

import slashmenu "github.com/GordenArcher/axon-core/internal/agentcli/tui/components/slash"

// The catalog lives beside the composer because filtering depends on the text
// the user is typing, not on the command handlers themselves.
var slashCommands = []slashmenu.Command{
	{Name: "new", Description: "Start a new conversation"},
	{Name: "model", Description: "Choose the active model"},
	{Name: "resume", Description: "Resume a saved conversation"},
	{Name: "select", Description: "Enter selection mode for copy"},
	{Name: "status", Description: "Show session details"},
	{Name: "clear", Description: "Clear the transcript and start new"},
	{Name: "help", Description: "Show commands and keys"},
	{Name: "quit", Description: "Exit Axon"},
}
