// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"encoding/json"
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	"github.com/GordenArcher/axon-core/internal/ai"
	store "github.com/GordenArcher/axon-core/internal/sessions"
)

// Keep enough prior turns for continuity without letting old tool output crowd
// the system prompt and tool schemas out of the model's context window. Core
// applies a second budget after this list is built.
const maxModelHistoryMessages = 32

// modelHistory rebuilds the tool-aware conversation from the transcript. Each
// tool card becomes the assistant tool_calls message plus its tool result, so a
// follow-up turn can reason about what the agent already inspected instead of
// re-running the same reads. Thinking rows stay local.
func modelHistory(messages []components.Message) []ai.ModelMessage {
	history := make([]ai.ModelMessage, 0, len(messages)*2)
	for _, message := range messages {
		if message.ID == "" || message.Thinking {
			continue
		}
		if message.Tool != nil {
			if strings.TrimSpace(message.Tool.Name) == "" {
				continue
			}
			arguments := strings.TrimSpace(message.Tool.Arguments)
			if arguments == "" {
				arguments = "{}"
			}
			history = append(history, ai.ModelMessage{
				Role: "assistant",
				ToolCalls: []ai.ModelToolCall{{
					Function: ai.ModelToolFunction{
						Name:      message.Tool.Name,
						Arguments: json.RawMessage(arguments),
					},
				}},
			})
			history = append(history, ai.ModelMessage{
				Role:    "tool",
				Content: message.Tool.Result,
			})
			continue
		}
		if strings.TrimSpace(message.Content) == "" {
			continue
		}
		role := message.Role
		if role != "assistant" {
			role = "user"
		}
		history = append(history, ai.ModelMessage{
			Role:    role,
			Content: message.Content,
		})
	}

	if len(history) > maxModelHistoryMessages {
		history = history[len(history)-maxModelHistoryMessages:]
	}
	// A tool result without its assistant tool_calls message is invalid context.
	for len(history) > 0 && history[0].Role == "tool" {
		history = history[1:]
	}
	return history
}

// persistedMessages projects the transcript onto the rows the session database
// owns. The ID filter matters: the welcome message has no ID and must never be
// written, while every real turn gets one when it is created so a resumed
// transcript can round-trip without a second key.
func persistedMessages(messages []components.Message) []store.Message {
	rows := make([]store.Message, 0, len(messages))
	for _, message := range messages {
		// The welcome line is the only message without an ID. Every real turn
		// and tool card gets one when it is created, so the ID check is enough
		// and does not couple persistence to a user-message position.
		if message.ID == "" {
			continue
		}
		if message.Tool != nil {
			data, err := json.Marshal(message.Tool)
			if err != nil {
				continue
			}
			rows = append(rows, store.Message{
				ID:   message.ID,
				Role: "tool",
				Kind: "tool",
				Data: string(data),
			})
			continue
		}
		if message.Content == "" {
			continue
		}
		rows = append(rows, store.Message{
			ID:        message.ID,
			Role:      message.Role,
			Content:   message.Content,
			Thinking:  message.Thinking,
			Collapsed: message.Collapsed,
		})
	}
	return rows
}

// transcriptMessages widens storage rows back into the renderer's message
// type. Keeping this conversion here means the store never imports the UI.
func transcriptMessages(messages []store.Message) []components.Message {
	rows := make([]components.Message, 0, len(messages))
	for _, message := range messages {
		if message.Kind == "tool" {
			var tool components.Tool
			if err := json.Unmarshal([]byte(message.Data), &tool); err != nil {
				// A corrupt card must not hide the rest of the transcript.
				rows = append(rows, components.Message{
					ID:      message.ID,
					Role:    "tool",
					Content: message.Data,
				})
				continue
			}
			rows = append(rows, components.Message{
				ID:   message.ID,
				Role: "tool",
				Tool: &tool,
			})
			continue
		}
		rows = append(rows, components.Message{
			ID:        message.ID,
			Role:      message.Role,
			Content:   message.Content,
			Thinking:  message.Thinking,
			Collapsed: message.Collapsed,
		})
	}
	return rows
}

// sessionTitle keeps an existing title, including one loaded from the database,
// and only derives a new one when the session is still unnamed.
func sessionTitle(messages []components.Message, current string) string {
	if current != "" && current != store.DefaultTitle {
		return current
	}
	for _, message := range messages {
		if message.Role == "user" && strings.TrimSpace(message.Content) != "" {
			return store.Title(message.Content)
		}
	}
	return store.DefaultTitle
}
