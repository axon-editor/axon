package agentcli

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/GordenArcher/axon-core/internal/ai"
)

func runResume(args []string) int {
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

	conversationID := ""
	if len(args) > 0 {
		conversationID = strings.TrimSpace(strings.TrimPrefix(args[0], ":"))
	}

	if conversationID == "" {
		sessions, err := workspaceSessions(workspace)
		if err != nil {
			fmt.Fprintln(os.Stderr, red(err.Error()))
			return 1
		}
		if len(sessions) == 0 {
			return printSessionList(workspace)
		}
		selected, ok, err := selectResumeSessionPrompt(sessions)
		if err != nil {
			fmt.Fprintln(os.Stderr, red(err.Error()))
			return 1
		}
		if !ok || selected == nil {
			return printSessionList(workspace)
		}
		return runLoadedSession(workspace, *selected)
	}

	session, err := findWorkspaceSession(workspace, conversationID)
	if err != nil {
		fmt.Fprintln(os.Stderr, red(err.Error()))
		return 1
	}
	if session == nil {
		fmt.Fprintln(os.Stderr, red("No session found with that id in this workspace."))
		return printSessionList(workspace)
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

	return runTerminalSession(workspace, &loaded)
}
