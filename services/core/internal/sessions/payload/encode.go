// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package payload

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/GordenArcher/axon-core/internal/sessions/session"
)

// Encode converts the CLI transcript into the editor's conversation record.
// The editor renders timeline entries when present, so every assistant text,
// thought, and tool card goes into the timeline in transcript order.
func Encode(meta Meta, messages []session.Message) (string, error) {
	created := meta.CreatedAt
	if created.IsZero() {
		created = time.Now()
	}
	updated := meta.UpdatedAt
	if updated.IsZero() {
		updated = time.Now()
	}
	action := meta.Action
	if action == "" {
		action = "agent"
	}

	conversation := editorConversation{
		ID:               meta.ID,
		Title:            meta.Title,
		CreatedAt:        created.UnixMilli(),
		UpdatedAt:        updated.UnixMilli(),
		Pinned:           meta.Pinned,
		Action:           action,
		BackendSessionID: meta.BackendSessionID,
	}

	nextID := 1
	var current *editorMessage
	flush := func() {
		if current == nil {
			return
		}
		conversation.Messages = append(conversation.Messages, *current)
		current = nil
	}
	ensureCurrent := func() *editorMessage {
		if current == nil {
			current = &editorMessage{ID: nextID, Role: "assistant"}
			nextID++
		}
		return current
	}
	addEntry := func(message *editorMessage, entry editorEntry) {
		entry.ID = fmt.Sprintf("t%d-%d", message.ID, len(message.Timeline)+1)
		message.Timeline = append(message.Timeline, entry)
	}

	for _, message := range messages {
		if message.Kind == "tool" {
			tool, ok := decodeTool(message.Data)
			if !ok {
				continue
			}
			assistant := ensureCurrent()
			addEntry(assistant, editorEntry{Kind: "tool", Tool: tool})
			continue
		}
		switch message.Role {
		case "user":
			flush()
			conversation.Messages = append(conversation.Messages, editorMessage{
				ID:      nextID,
				Role:    "user",
				Content: message.Content,
			})
			nextID++
		case "assistant":
			if message.Thinking {
				assistant := ensureCurrent()
				addEntry(assistant, editorEntry{Kind: "thought", Content: message.Content})
				continue
			}
			if strings.TrimSpace(message.Content) == "" {
				continue
			}
			assistant := ensureCurrent()
			assistant.Content += message.Content
			addEntry(assistant, editorEntry{Kind: "text", Content: message.Content})
		}
	}
	flush()

	raw, err := json.Marshal(conversation)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

func decodeTool(data string) (*editorTool, bool) {
	var tool toolData
	if err := json.Unmarshal([]byte(data), &tool); err != nil {
		return nil, false
	}
	arguments := map[string]any{}
	if strings.TrimSpace(tool.Arguments) != "" {
		_ = json.Unmarshal([]byte(tool.Arguments), &arguments)
	}
	status := "done"
	switch {
	case tool.Waiting:
		status = "pending"
	case tool.Running:
		status = "running"
	case tool.Approval == "denied":
		status = "rejected"
	case !tool.OK:
		status = "error"
	}
	return &editorTool{
		ID:        tool.CallID,
		Name:      tool.Name,
		Kind:      "workspace",
		Title:     tool.Name,
		Arguments: arguments,
		Status:    status,
		Message:   tool.Result,
		Result:    tool.Result,
		Approval:  tool.Approval,
		Expanded:  tool.Expanded,
	}, true
}
