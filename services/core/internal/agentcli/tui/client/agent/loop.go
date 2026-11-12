// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package agent

import (
	"context"
	"strings"
	"time"

	opencoderun "github.com/GordenArcher/axon-core/internal/agentcli/opencode/run"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client/tools"
	"github.com/GordenArcher/axon-core/internal/ai"
	"github.com/google/uuid"
)

// Local models need several search and read rounds before they can answer. The
// ceiling fits a full investigation while still bounding a runaway loop.
const maxToolRounds = 12

type loop struct {
	request  client.Request
	events   chan<- client.Event
	messages []ai.ModelMessage
}

// Run owns the agent loop from the CLI side. Core plans one turn at a time and
// streams the final answer; the CLI executes tools so a write or command can
// block on a real approval instead of disappearing behind a status string.
func Run(ctx context.Context, request client.Request, events chan<- client.Event) {
	defer close(events)

	// OpenCode owns its own tool loop and workspace calls. Routing it before
	// core means the terminal does not start a second agent that would compete
	// for the same turn or duplicate every tool event.
	if request.Backend == "opencode" {
		opencoderun.Run(ctx, request, events)
		return
	}

	emit := func(event client.Event) error {
		return emitEvent(ctx, events, event)
	}

	if err := emit(client.Event{Kind: client.Status, Text: "Connecting to Axon..."}); err != nil {
		return
	}
	port, folder, err := client.Ready(ctx, request.FolderPath)
	if err != nil {
		fail(ctx, emit, err)
		return
	}
	request.FolderPath = folder

	agent := &loop{
		request:  request,
		events:   events,
		messages: nil,
	}
	if err := agent.run(ctx, port); err != nil {
		fail(ctx, emit, err)
	}
}

func (l *loop) run(ctx context.Context, port string) error {
	definitions := tools.Definitions(ctx, port)
	reachedLimit := true

	for round := 0; round < maxToolRounds; round++ {
		plan, err := client.Plan(ctx, port, client.Request{
			Prompt:       l.request.Prompt,
			FolderPath:   l.request.FolderPath,
			Model:        l.request.Model,
			Conversation: l.request.Conversation,
			History:      l.request.History,
			Messages:     l.messages,
			Tools:        definitions,
		}, func(event client.Event) error {
			return emitEvent(ctx, l.events, event)
		})
		if err != nil {
			return err
		}
		if len(plan.Messages) > 0 {
			l.messages = plan.Messages
		}

		if len(plan.ToolCalls) == 0 {
			if content := strings.TrimSpace(plan.Content); content != "" {
				if err := emitEvent(ctx, l.events, client.Event{Kind: client.Delta, Text: plan.Content}); err != nil {
					return err
				}
				return emitEvent(ctx, l.events, client.Event{Kind: client.Done})
			}
			reachedLimit = false
			break
		}

		// The visible plan belongs in the same thought block as the streamed
		// reasoning, not in the final answer.
		if content := strings.TrimSpace(plan.Content); content != "" {
			if err := emitEvent(ctx, l.events, client.Event{Kind: client.Thought, Text: plan.Content}); err != nil {
				return err
			}
		}

		l.messages = append(l.messages, ai.ModelMessage{
			Role:      "assistant",
			Content:   plan.Content,
			ToolCalls: plan.ToolCalls,
		})
		for _, call := range plan.ToolCalls {
			result, err := l.execute(ctx, port, call)
			if err != nil {
				return err
			}
			l.messages = append(l.messages, ai.ModelMessage{
				Role:    "tool",
				Content: result.Content,
			})
		}

		if err := emitEvent(ctx, l.events, client.Event{
			Kind: client.Status,
			Text: "Reviewing tool results...",
		}); err != nil {
			return err
		}
	}

	if reachedLimit {
		l.messages = append(l.messages, ai.ModelMessage{
			Role:    "tool",
			Content: "Tool limit reached. Answer with the information already gathered.",
		})
	}

	return client.StreamChat(ctx, port, client.Request{
		Prompt:     l.request.Prompt,
		FolderPath: l.request.FolderPath,
		Model:      l.request.Model,
		Messages:   l.messages,
	}, func(event client.Event) error {
		return emitEvent(ctx, l.events, event)
	})
}

func (l *loop) execute(
	ctx context.Context,
	port string,
	call ai.ModelToolCall,
) (tools.Result, error) {
	callID := uuid.NewString()
	name := call.Function.Name
	arguments := call.Function.Arguments

	approval := ""
	if tools.NeedsApproval(name) {
		summary, details, allowSession := tools.ApprovalDetails(name, arguments)
		if name == tools.RunCommandTool && l.commandAllowed(summary) {
			approval = "session"
		} else {
			if err := emitEvent(ctx, l.events, client.Event{
				Kind:         client.ApprovalRequest,
				ToolCallID:   callID,
				ToolName:     name,
				Arguments:    string(arguments),
				Summary:      summary,
				Details:      details,
				AllowSession: allowSession,
			}); err != nil {
				return tools.Result{}, err
			}

			decision, ok := l.awaitDecision(ctx, callID)
			if !ok {
				if ctx.Err() != nil {
					return tools.Result{}, ctx.Err()
				}
				return l.denyTool(ctx, callID, name)
			}
			if !decision.Approved {
				return l.denyTool(ctx, callID, name)
			}
			approval = "once"
			if decision.AllowSession && allowSession {
				approval = "session"
				l.allowCommand(summary)
			}
		}
	}

	if err := emitEvent(ctx, l.events, client.Event{
		Kind:       client.ToolStart,
		ToolCallID: callID,
		ToolName:   name,
		Arguments:  string(arguments),
		Approval:   approval,
	}); err != nil {
		return tools.Result{}, err
	}

	started := time.Now()
	result := tools.Execute(ctx, port, l.request.FolderPath, name, arguments)
	if err := ctx.Err(); err != nil {
		return tools.Result{}, err
	}
	if err := emitEvent(ctx, l.events, client.Event{
		Kind:       client.ToolResult,
		ToolCallID: callID,
		ToolName:   name,
		Result:     result.Content,
		OK:         result.OK,
		DurationMS: time.Since(started).Milliseconds(),
		Approval:   approval,
	}); err != nil {
		return tools.Result{}, err
	}
	return result, nil
}

func (l *loop) commandAllowed(command string) bool {
	if l.request.CommandAllowed == nil {
		return false
	}
	return l.request.CommandAllowed(command)
}

func (l *loop) allowCommand(command string) {
	if l.request.AllowCommand != nil {
		l.request.AllowCommand(command)
	}
}

func (l *loop) denyTool(
	ctx context.Context,
	callID string,
	name string,
) (tools.Result, error) {
	result := tools.Result{
		Content: "The user declined to run " + name + ".",
		OK:      false,
	}
	if err := emitEvent(ctx, l.events, client.Event{
		Kind:       client.ToolResult,
		ToolCallID: callID,
		ToolName:   name,
		Result:     result.Content,
		OK:         false,
		Approval:   "denied",
	}); err != nil {
		return tools.Result{}, err
	}
	return result, nil
}

func emitEvent(ctx context.Context, events chan<- client.Event, event client.Event) error {
	select {
	case events <- event:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func fail(ctx context.Context, emit func(client.Event) error, err error) {
	if ctx.Err() != nil {
		_ = emit(client.Event{Kind: client.Cancelled, Text: "Cancelled."})
		return
	}
	_ = emit(client.Event{Kind: client.Error, Text: err.Error()})
}
