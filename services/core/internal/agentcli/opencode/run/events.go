// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package run

import (
	"context"
	"encoding/json"
	"strings"

	opencodeclient "github.com/GordenArcher/axon-core/internal/agentcli/opencode/client"
	"github.com/GordenArcher/axon-core/internal/agentcli/opencode/run/permission"
	tuiclient "github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
)

// handler keeps the per-turn maps the event stream needs. OpenCode sends tool
// names, inputs, and results as separate events, so the handler stitches them
// back into the single card the transcript renders.
type handler struct {
	ctx        context.Context
	api        *opencodeclient.Client
	sessionID  string
	send       func(tuiclient.Event) error
	decisions  <-chan tuiclient.Decision
	toolNames  map[string]string
	toolInputs map[string]map[string]any
	done       bool
}

// newHandler is built per turn because tool maps are scoped to one provider
// session. Reusing them would leak a tool name from an old conversation into a
// resumed one.
func newHandler(
	ctx context.Context,
	api *opencodeclient.Client,
	sessionID string,
	send func(tuiclient.Event) error,
	decisions <-chan tuiclient.Decision,
) *handler {
	return &handler{
		ctx:        ctx,
		api:        api,
		sessionID:  sessionID,
		send:       send,
		decisions:  decisions,
		toolNames:  make(map[string]string),
		toolInputs: make(map[string]map[string]any),
	}
}

// handle filters the shared provider event bus to this session. Subagent events
// are deliberately dropped so their tool calls do not look like the main
// agent's work in the transcript.
func (h *handler) handle(event opencodeclient.Event) error {
	data := event.Data
	if data == nil {
		data = map[string]any{}
	}
	if sessionID := stringValue(data, "sessionID"); sessionID != "" && sessionID != h.sessionID {
		return nil
	}

	switch event.Type {
	case "session.reasoning.delta":
		if thought := stringValue(data, "delta"); thought != "" {
			return h.emit(tuiclient.Event{Kind: tuiclient.Thought, Text: thought})
		}
	case "session.text.delta":
		if delta := stringValue(data, "delta"); delta != "" {
			return h.emit(tuiclient.Event{Kind: tuiclient.Delta, Text: delta})
		}
	case "session.tool.input.started":
		if id := stringValue(data, "id"); id != "" {
			if name := stringValue(data, "name"); name != "" {
				h.toolNames[id] = name
			}
		}
	case "session.tool.called":
		h.toolCalled(data)
	case "session.tool.success", "session.tool.failed":
		h.toolFinished(event.Type, data)
	case "permission.asked":
		return h.permissionAsked(data)
	case "session.status":
		return h.statusValue(data)
	case "session.step.started":
		return h.emit(tuiclient.Event{Kind: tuiclient.Status, Text: "Thinking..."})
	case "session.retry.scheduled":
		return h.emit(tuiclient.Event{Kind: tuiclient.Status, Text: "Retrying..."})
	case "session.compaction.started":
		return h.emit(tuiclient.Event{Kind: tuiclient.Status, Text: "Compacting context..."})
	case "session.execution.succeeded":
		h.done = true
		return h.emit(tuiclient.Event{Kind: tuiclient.Done})
	case "session.execution.interrupted":
		h.done = true
		return h.emit(tuiclient.Event{Kind: tuiclient.Cancelled, Text: "Interrupted."})
	case "session.execution.failed", "session.error":
		h.done = true
		return h.emit(tuiclient.Event{Kind: tuiclient.Error, Text: errorText(data)})
	}
	return nil
}

func (h *handler) emit(event tuiclient.Event) error {
	return h.send(event)
}

// statusValue keeps the TUI's activity line aligned with the provider state.
// The provider also sends step events, so unknown statuses stay silent instead
// of replacing a more specific message with a generic one.
func (h *handler) statusValue(data map[string]any) error {
	switch stringValue(data, "status") {
	case "busy":
		return h.emit(tuiclient.Event{Kind: tuiclient.Status, Text: "Working..."})
	case "retry":
		return h.emit(tuiclient.Event{Kind: tuiclient.Status, Text: "Retrying..."})
	}
	return nil
}

// toolCalled opens the running card. The permission bridge may already have
// created a waiting card for the same id, and the TUI merges them by call id so
// the user sees one row move from waiting to running.
func (h *handler) toolCalled(data map[string]any) {
	id := stringValue(data, "id")
	if id == "" {
		return
	}
	name := h.toolNames[id]
	if name == "" {
		name = stringValue(data, "name")
	}
	if name == "" {
		name = "tool"
	}
	input, _ := data["input"].(map[string]any)
	if input == nil {
		input = map[string]any{}
	}
	h.toolInputs[id] = input
	_ = h.emit(tuiclient.Event{
		Kind:       tuiclient.ToolStart,
		ToolCallID: id,
		ToolName:   name,
		Arguments:  jsonText(input),
	})
}

// toolFinished keeps the failed path's provider message as the card result.
// Dropping it leaves a red card with no explanation of what went wrong.
func (h *handler) toolFinished(eventType string, data map[string]any) {
	id := stringValue(data, "id")
	if id == "" {
		return
	}
	name := h.toolNames[id]
	if name == "" {
		name = "tool"
	}
	ok := eventType == "session.tool.success"
	_ = h.emit(tuiclient.Event{
		Kind:       tuiclient.ToolResult,
		ToolCallID: id,
		ToolName:   name,
		Result:     toolResultText(data),
		OK:         ok,
	})
	delete(h.toolInputs, id)
}

func (h *handler) permissionAsked(data map[string]any) error {
	request, ok := permission.FromData(data)
	if !ok {
		return nil
	}
	toolID := request.Source.ID
	if toolID == "" {
		toolID = request.ID
	}
	name := h.toolNames[toolID]
	if name == "" {
		name = request.Action
	}
	if err := h.emit(tuiclient.Event{
		Kind:         tuiclient.ApprovalRequest,
		ToolCallID:   toolID,
		ToolName:     name,
		Arguments:    permission.Arguments(request),
		Summary:      permission.Summary(request),
		Details:      permission.Details(request),
		AllowSession: true,
	}); err != nil {
		return err
	}

	// The provider is blocked until it gets a reply, so the event scanner waits
	// here on purpose. Emitting the card first is what lets the TUI draw the
	// prompt before the reply unblocks the turn.
	decision, answered := permission.Await(h.ctx, h.decisions, toolID)
	reply := "reject"
	if answered {
		reply = permission.DecisionName(decision)
	}
	permission.Reply(h.api, h.sessionID, request.ID, reply)
	return nil
}

// stringValue trims provider strings because some events pad ids and names with
// whitespace, which would make map lookups miss the row they belong to.
func stringValue(data map[string]any, key string) string {
	value, _ := data[key].(string)
	return strings.TrimSpace(value)
}

// errorText prefers the provider's error field and falls back to its message.
// The generic fallback only appears when the event carried neither, which is
// rare but better than an empty error card.
func errorText(data map[string]any) string {
	if message := stringValue(data, "error"); message != "" {
		return message
	}
	if message := stringValue(data, "message"); message != "" {
		return message
	}
	return "OpenCode could not complete the request."
}

// jsonText encodes tool arguments for the transcript card. An encoding failure
// returns an empty string so a weird provider payload loses its detail instead
// of ending the turn.
func jsonText(value any) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(encoded)
}

// toolResultText joins text parts because providers can split one result across
// several content entries. Falling back to error and message covers tools that
// report failure without a content array.
func toolResultText(data map[string]any) string {
	content, _ := data["content"].([]any)
	parts := make([]string, 0, len(content))
	for _, item := range content {
		entry, _ := item.(map[string]any)
		if text := stringValue(entry, "text"); text != "" {
			parts = append(parts, text)
		}
	}
	if len(parts) > 0 {
		return strings.Join(parts, "\n")
	}
	if message := stringValue(data, "error"); message != "" {
		return message
	}
	return stringValue(data, "message")
}
