// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const installedRuntimeModel = "qwen2.5-coder:7b"

// newModelRuntimeServer points the ai package at a fake Ollama runtime so the
// caller-driven turn and stream paths can be exercised without a real model.
// /api/tags always reports the default runtime model as installed, and the
// caller decides how /api/chat responds. captured receives the last decoded
// chat payload so a test can assert what actually reached the model.
func newModelRuntimeServer(t *testing.T, chat http.HandlerFunc, captured *map[string]any) {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/tags":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"models":[{"name":"` + installedRuntimeModel + `"}]}`))
		case "/api/chat":
			if captured != nil {
				_ = json.NewDecoder(r.Body).Decode(captured)
			}
			chat(w, r)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	t.Setenv("AXON_MODELS_URL", server.URL)
	t.Setenv("AXON_MODELS_MODEL", "")
}

func TestPlanTurnReturnsRequestedToolCall(t *testing.T) {
	newModelRuntimeServer(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"message":{"content":"","tool_calls":[{"function":{"name":"list_files","arguments":{"path":""}}}]}}`))
	}, nil)

	result, err := PlanTurn(context.Background(), ChatRequest{Action: "ask", Prompt: "list files"})
	if err != nil {
		t.Fatalf("PlanTurn returned error: %v", err)
	}
	if len(result.Message.ToolCalls) != 1 {
		t.Fatalf("expected one tool call, got %d", len(result.Message.ToolCalls))
	}
	if name := result.Message.ToolCalls[0].Function.Name; name != "list_files" {
		t.Fatalf("expected list_files tool call, got %q", name)
	}
	if len(result.Messages) == 0 || result.Messages[0].Role != "system" {
		t.Fatalf("PlanTurn should return the built conversation, got %#v", result.Messages)
	}
}

func TestPlanTurnKeepsCallerMessagesAndTools(t *testing.T) {
	var captured map[string]any
	newModelRuntimeServer(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"message":{"content":"ok"}}`))
	}, &captured)

	messages := []ModelMessage{
		{Role: "system", Content: "system prompt"},
		{Role: "user", Content: "ping"},
	}
	result, err := PlanTurn(context.Background(), ChatRequest{
		Action:   "ask",
		Messages: messages,
		Tools:    ProjectToolDefinitions(),
	})
	if err != nil {
		t.Fatalf("PlanTurn returned error: %v", err)
	}
	if len(result.Messages) != 2 || result.Messages[0].Content != "system prompt" {
		t.Fatalf("PlanTurn should keep the caller conversation, got %#v", result.Messages)
	}

	if _, hasTools := captured["tools"]; !hasTools {
		t.Fatal("PlanTurn should forward caller-supplied tools to the model")
	}
	sentMessages, _ := captured["messages"].([]any)
	if len(sentMessages) != 2 {
		t.Fatalf("expected the two caller messages to reach the model, got %d", len(sentMessages))
	}
}

func TestStreamChatUsesCallerMessagesWithoutProjectTools(t *testing.T) {
	var captured map[string]any
	newModelRuntimeServer(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("{\"message\":{\"content\":\"pong\"},\"done\":false}\n{\"done\":true}\n"))
	}, &captured)

	var deltas []string
	err := StreamChat(context.Background(), ChatRequest{
		Action: "ask",
		Messages: []ModelMessage{
			{Role: "system", Content: "system prompt"},
			{Role: "user", Content: "ping"},
		},
	}, func(event StreamEvent) error {
		if event.Type == "delta" {
			deltas = append(deltas, event.Delta)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("StreamChat returned error: %v", err)
	}
	if strings.Join(deltas, "") != "pong" {
		t.Fatalf("expected streamed delta pong, got %q", strings.Join(deltas, ""))
	}

	sentMessages, _ := captured["messages"].([]any)
	if len(sentMessages) != 2 {
		t.Fatalf("expected the two caller messages to be sent, got %d", len(sentMessages))
	}
	first, _ := sentMessages[0].(map[string]any)
	if first["role"] != "system" || first["content"] != "system prompt" {
		t.Fatalf("expected the caller system message to reach the model, got %#v", first)
	}
	if _, hasTools := captured["tools"]; hasTools {
		t.Fatal("a caller-owned stream must not inject project tools")
	}
}
