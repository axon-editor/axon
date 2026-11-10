// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/store"
	"github.com/GordenArcher/axon-core/internal/ai"
)

// conversationHistory strips the greeting and thinking blocks before a prompt
// leaves the process. axon-core expects a clean user/assistant transcript, and
// sending the welcome line would make the model think it already spoke.
func conversationHistory(messages []components.Message) []ai.ConversationMessage {
	started := false
	history := make([]ai.ConversationMessage, 0, len(messages))
	for _, message := range messages {
		if message.Role == "user" {
			started = true
		}
		if !started || message.Content == "" || message.Thinking {
			continue
		}
		history = append(history, ai.ConversationMessage{
			Role:    message.Role,
			Content: message.Content,
		})
	}
	return history
}

// persistedMessages projects the transcript onto the rows the session database
// owns. The ID filter matters: the welcome message has no ID and must never be
// written, while every real turn gets one when it is created so a resumed
// transcript can round-trip without a second key.
func persistedMessages(messages []components.Message) []store.Message {
	started := false
	rows := make([]store.Message, 0, len(messages))
	for _, message := range messages {
		if message.Role == "user" {
			started = true
		}
		if !started || message.Content == "" || message.ID == "" {
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
