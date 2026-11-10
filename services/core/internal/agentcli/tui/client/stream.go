// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package client

import (
	"context"

	"github.com/GordenArcher/axon-core/internal/ai"
)

type EventKind int

const (
	Status EventKind = iota
	Thought
	Delta
	ToolStart
	ToolResult
	ApprovalRequest
	Done
	Cancelled
	Error
)

type Event struct {
	Kind EventKind
	Text string

	// Tool lifecycle fields are only set for ToolStart, ToolResult, and
	// ApprovalRequest. CallID pairs them so the transcript can turn a waiting
	// card into a running card and then into its result.
	ToolCallID   string
	ToolName     string
	Arguments    string
	Result       string
	OK           bool
	DurationMS   int64
	Summary      string
	Details      string
	Approval     string
	AllowSession bool
}

// Decision is the user's answer to an ApprovalRequest. It travels back to the
// agent goroutine through Request.Decisions.
type Decision struct {
	ID           string
	Approved     bool
	AllowSession bool
}

type Request struct {
	Conversation []ai.ConversationMessage
	FolderPath   string
	Model        string
	Prompt       string

	// Messages and Tools are filled by the agent loop for planning rounds.
	// StreamChat sends them to core so core does not start its own tool loop.
	Messages []ai.ModelMessage
	Tools    []ai.ProjectToolDefinition
	// History carries prior tool-aware turns on the first planning round. Core
	// uses it only while Messages is empty, so it can still build the system
	// prompt and project context.
	History []ai.ModelMessage

	// Decisions is shared with the TUI. The agent blocks on it while a mutating
	// tool is waiting for approval.
	Decisions <-chan Decision

	// CommandAllowed and AllowCommand keep the exact-command allowlist in the
	// TUI model so it survives across turns. The agent only calls them for
	// run_command.
	CommandAllowed func(command string) bool
	AllowCommand   func(command string)
}

// Stream is the legacy one-call entry point. The TUI uses agent.Run now, but
// keeping Stream as a thin wrapper gives tests and simple callers a channel API.
func Stream(ctx context.Context, request Request, events chan<- Event) {
	defer close(events)
	events <- Event{Kind: Status, Text: "Connecting to Axon..."}

	port, folder, err := Ready(ctx, request.FolderPath)
	if err != nil {
		sendError(ctx, events, err)
		return
	}
	request.FolderPath = folder
	if err := StreamChat(ctx, port, request, func(event Event) error {
		events <- event
		return nil
	}); err != nil {
		sendError(ctx, events, err)
	}
}
