// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package client

import (
	"context"

	"github.com/GordenArcher/axon-core/internal/ai"
)

// PlanResult is one planning round. Content is the model's explanation for the
// tool calls; it is not emitted as answer text until the loop knows there are no
// more tools to run.
type PlanResult struct {
	Content   string
	ToolCalls []ai.ModelToolCall
	Messages  []ai.ModelMessage
}

// Plan runs one streaming planning turn and buffers visible content. Thoughts
// are forwarded immediately so the TUI keeps the live reasoning block.
func Plan(
	ctx context.Context,
	port string,
	request Request,
	emit func(Event) error,
) (PlanResult, error) {
	envelope := ai.ChatRequest{
		Action:     "agent",
		Prompt:     request.Prompt,
		FolderPath: &request.FolderPath,
		Model:      request.Model,
		Messages:   request.Messages,
		Tools:      request.Tools,
	}
	if len(request.Messages) == 0 {
		envelope.Conversation = request.Conversation
		envelope.History = request.History
	}

	response, err := postStream(ctx, port, "/ai/chat/stream", envelope)
	if err != nil {
		return PlanResult{}, err
	}
	defer response.Body.Close()

	result := PlanResult{}
	err = readStream(response.Body, func(event ai.StreamEvent) error {
		switch event.Type {
		case "status":
			if event.Status != "" {
				return emit(Event{Kind: Status, Text: event.Status})
			}
		case "thought":
			if event.Thought != "" {
				return emit(Event{Kind: Thought, Text: event.Thought})
			}
		case "delta":
			result.Content += event.Delta
		case "done":
			result.ToolCalls = event.ToolCalls
			result.Messages = event.Messages
		}
		return nil
	})
	return result, err
}
