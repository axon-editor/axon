// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package components

import (
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
	"github.com/charmbracelet/lipgloss"
)

// Message is the TUI's transcript unit. The CLI does not render tool cards yet;
// keeping the role and text separate lets the renderer grow without changing
// the streaming client.
type Message struct {
	ID        string
	Role      string
	Content   string
	Thinking  bool
	Collapsed bool
}

// Render builds the transcript for the viewport. Lip Gloss owns wrapping so a
// long assistant answer follows the terminal width instead of producing a
// horizontal scrollbar.
func Render(messages []Message, width int) string {
	if width < 20 {
		width = 20
	}
	contentWidth := width - 2

	var builder strings.Builder
	for index, message := range messages {
		if index > 0 {
			builder.WriteString("\n")
		}

		if message.Thinking {
			header := "▸ Thought"
			if !message.Collapsed {
				header = "▾ Thinking"
			}
			builder.WriteString(theme.ThinkingHead.Render(header))
			builder.WriteString("\n")
			if !message.Collapsed && message.Content != "" {
				builder.WriteString(
					theme.Thinking.
						Width(contentWidth).
						Render(message.Content),
				)
				builder.WriteString("\n")
			}
			continue
		}

		label := theme.UserLabel.Render("You")
		if message.Role == "assistant" {
			label = theme.Assistant.Render("Axon")
		}
		builder.WriteString(label)
		builder.WriteString("\n")

		if message.Content != "" {
			builder.WriteString(
				lipgloss.NewStyle().Width(contentWidth).Render(message.Content),
			)
			builder.WriteString("\n")
		}
	}

	return builder.String()
}
