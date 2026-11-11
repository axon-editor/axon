// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package payload

import (
	"encoding/json"
	"strings"

	"github.com/GordenArcher/axon-core/internal/sessions/identity"
	"github.com/GordenArcher/axon-core/internal/sessions/session"
)

// Decode converts an editor conversation record into CLI transcript rows. Text
// and thought entries keep their order, and every tool entry becomes the same
// JSON tool card the CLI writes itself.
func Decode(raw string) ([]session.Message, error) {
	var conversation editorConversation
	if err := json.Unmarshal([]byte(raw), &conversation); err != nil {
		return nil, err
	}

	messages := make([]session.Message, 0, len(conversation.Messages)*2)
	for _, editorMessage := range conversation.Messages {
		switch editorMessage.Role {
		case "user":
			if strings.TrimSpace(editorMessage.Content) == "" {
				continue
			}
			messages = append(messages, session.Message{
				ID:      identity.NewID(),
				Role:    "user",
				Content: editorMessage.Content,
			})
		case "assistant":
			if len(editorMessage.Timeline) > 0 {
				messages = append(messages, decodeTimeline(editorMessage.Timeline)...)
				continue
			}
			if strings.TrimSpace(editorMessage.Content) != "" {
				messages = append(messages, session.Message{
					ID:      identity.NewID(),
					Role:    "assistant",
					Content: editorMessage.Content,
				})
			}
			for _, call := range editorMessage.ToolCalls {
				messages = append(messages, toolCallMessage(call))
			}
		}
	}
	return messages, nil
}

func decodeTimeline(entries []editorEntry) []session.Message {
	messages := make([]session.Message, 0, len(entries))
	var text strings.Builder
	flushText := func() {
		if text.Len() == 0 {
			return
		}
		messages = append(messages, session.Message{
			ID:      identity.NewID(),
			Role:    "assistant",
			Content: text.String(),
		})
		text.Reset()
	}

	for _, entry := range entries {
		switch entry.Kind {
		case "text":
			text.WriteString(entry.Content)
		case "thought":
			flushText()
			if strings.TrimSpace(entry.Content) == "" {
				continue
			}
			messages = append(messages, session.Message{
				ID:        identity.NewID(),
				Role:      "assistant",
				Thinking:  true,
				Collapsed: true,
				Content:   entry.Content,
			})
		case "tool":
			flushText()
			if entry.Tool == nil {
				continue
			}
			messages = append(messages, editorToolMessage(entry.Tool))
		}
	}
	flushText()
	return messages
}

func editorToolMessage(tool *editorTool) session.Message {
	arguments, _ := json.Marshal(tool.Arguments)
	ok := tool.Status == "done"
	running := tool.Status == "running"
	waiting := tool.Status == "pending"
	approval := tool.Approval
	if tool.Status == "rejected" {
		approval = "denied"
	}
	data, _ := json.Marshal(toolData{
		CallID:    tool.ID,
		Name:      tool.Name,
		Arguments: string(arguments),
		Result:    tool.Result,
		OK:        ok,
		Running:   running,
		Waiting:   waiting,
		Approval:  approval,
		Expanded:  tool.Expanded,
	})
	return session.Message{
		ID:   identity.NewID(),
		Role: "tool",
		Kind: "tool",
		Data: string(data),
	}
}

func toolCallMessage(call editorToolCall) session.Message {
	arguments, _ := json.Marshal(call.Function.Arguments)
	data, _ := json.Marshal(toolData{
		CallID:    identity.NewID(),
		Name:      call.Function.Name,
		Arguments: string(arguments),
		OK:        true,
	})
	return session.Message{
		ID:   identity.NewID(),
		Role: "tool",
		Kind: "tool",
		Data: string(data),
	}
}
