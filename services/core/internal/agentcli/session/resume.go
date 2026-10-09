// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package session

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/GordenArcher/axon-core/internal/ai"

	"github.com/GordenArcher/axon-core/internal/agentcli/colors"
	"github.com/GordenArcher/axon-core/internal/agentcli/workspacepath"
)

func RunResume(args []string) int {
	workspace, err := os.Getwd()
	if err != nil {
		fmt.Fprintln(os.Stderr, colors.Red(err.Error()))
		return 1
	}

	workspace, err = workspacepath.NormalizeWorkspacePath(workspace)
	if err != nil {
		fmt.Fprintln(os.Stderr, colors.Red(err.Error()))
		return 1
	}

	conversationID := ""
	if len(args) > 0 {
		conversationID = strings.TrimSpace(strings.TrimPrefix(args[0], ":"))
	}

	if conversationID == "" {
		sessions, err := workspaceSessions(workspace)
		if err != nil {
			fmt.Fprintln(os.Stderr, colors.Red(err.Error()))
			return 1
		}
		if len(sessions) == 0 {
			return PrintSessionList(workspace)
		}
		selected, ok, err := selectResumeSessionPrompt(sessions)
		if err != nil {
			fmt.Fprintln(os.Stderr, colors.Red(err.Error()))
			return 1
		}
		if !ok || selected == nil {
			return PrintSessionList(workspace)
		}
		return runLoadedSession(workspace, *selected)
	}

	session, err := FindWorkspaceSession(workspace, conversationID)
	if err != nil {
		fmt.Fprintln(os.Stderr, colors.Red(err.Error()))
		return 1
	}
	if session == nil {
		fmt.Fprintln(os.Stderr, colors.Red("No session found with that id in this workspace."))
		return PrintSessionList(workspace)
	}

	return runLoadedSession(workspace, *session)
}

func runLoadedSession(workspace string, session agentSessionRecord) int {
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

	return RunTerminalSession(workspace, &loaded)
}

// RunWorkspaceSession reopens a saved session from a pointer record. The
// command dispatcher owns `axon :id` routing, but the terminal session's
// timestamps are unexported, so the pointer-to-value unwrap stays here instead
// of exposing those fields just to serve one caller.
func RunWorkspaceSession(workspace string, record *agentSessionRecord) int {
	return runLoadedSession(workspace, *record)
}
