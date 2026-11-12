// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package run

import (
	"context"
	"testing"

	opencodeclient "github.com/GordenArcher/axon-core/internal/agentcli/opencode/client"
	tuiclient "github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
)

func newTestHandler() (*handler, *[]tuiclient.Event) {
	collected := make([]tuiclient.Event, 0, 8)
	handler := newHandler(
		context.Background(),
		nil,
		"session-1",
		func(event tuiclient.Event) error {
			collected = append(collected, event)
			return nil
		},
		nil,
	)
	return handler, &collected
}

func TestHandlerMapsTextThoughtAndStatus(t *testing.T) {
	handler, collected := newTestHandler()

	for _, event := range []opencodeclient.Event{
		{Type: "session.reasoning.delta", Data: map[string]any{"sessionID": "session-1", "delta": "plan"}},
		{Type: "session.text.delta", Data: map[string]any{"sessionID": "session-1", "delta": "answer"}},
		{Type: "session.step.started", Data: map[string]any{"sessionID": "session-1"}},
	} {
		if err := handler.handle(event); err != nil {
			t.Fatalf("handle returned %v", err)
		}
	}

	if len(*collected) != 3 {
		t.Fatalf("event count = %d", len(*collected))
	}
	if (*collected)[0].Kind != tuiclient.Thought || (*collected)[0].Text != "plan" {
		t.Fatalf("thought event = %#v", (*collected)[0])
	}
	if (*collected)[1].Kind != tuiclient.Delta || (*collected)[1].Text != "answer" {
		t.Fatalf("delta event = %#v", (*collected)[1])
	}
	if (*collected)[2].Kind != tuiclient.Status {
		t.Fatalf("status event = %#v", (*collected)[2])
	}
}

func TestHandlerIgnoresOtherSessions(t *testing.T) {
	handler, collected := newTestHandler()

	err := handler.handle(opencodeclient.Event{
		Type: "session.text.delta",
		Data: map[string]any{"sessionID": "another", "delta": "hidden"},
	})
	if err != nil {
		t.Fatalf("handle returned %v", err)
	}
	if len(*collected) != 0 {
		t.Fatalf("other session leaked %#v", *collected)
	}
}

func TestHandlerPairsToolStartAndResult(t *testing.T) {
	handler, collected := newTestHandler()

	for _, event := range []opencodeclient.Event{
		{Type: "session.tool.input.started", Data: map[string]any{"sessionID": "session-1", "id": "tool-1", "name": "read"}},
		{Type: "session.tool.called", Data: map[string]any{"sessionID": "session-1", "id": "tool-1", "input": map[string]any{"path": "README.md"}}},
		{Type: "session.tool.success", Data: map[string]any{"sessionID": "session-1", "id": "tool-1", "content": []any{map[string]any{"text": "hello"}}}},
	} {
		if err := handler.handle(event); err != nil {
			t.Fatalf("handle returned %v", err)
		}
	}

	if len(*collected) != 2 {
		t.Fatalf("event count = %d", len(*collected))
	}
	start := (*collected)[0]
	if start.Kind != tuiclient.ToolStart || start.ToolName != "read" {
		t.Fatalf("tool start = %#v", start)
	}
	result := (*collected)[1]
	if result.Kind != tuiclient.ToolResult || !result.OK || result.Result != "hello" {
		t.Fatalf("tool result = %#v", result)
	}
}

func TestHandlerFinishesOnExecutionSucceeded(t *testing.T) {
	handler, collected := newTestHandler()

	if err := handler.handle(opencodeclient.Event{
		Type: "session.execution.succeeded",
		Data: map[string]any{"sessionID": "session-1"},
	}); err != nil {
		t.Fatalf("handle returned %v", err)
	}
	if !handler.done {
		t.Fatal("handler did not mark the run done")
	}
	if len(*collected) != 1 || (*collected)[0].Kind != tuiclient.Done {
		t.Fatalf("done event = %#v", *collected)
	}
}
