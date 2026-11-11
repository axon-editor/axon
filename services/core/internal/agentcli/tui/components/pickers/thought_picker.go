// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package pickers

import (
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/transcript/surface"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
	"github.com/charmbracelet/lipgloss"
)

type ThoughtOption struct {
	Index     int
	Preview   string
	Collapsed bool
}

type ThoughtPicker struct {
	options  []ThoughtOption
	selected int
	offset   int
}

func NewThoughtPicker(options []ThoughtOption, selected int) ThoughtPicker {
	picker := ThoughtPicker{options: options}
	if selected >= 0 && selected < len(options) {
		picker.selected = selected
	}
	return picker
}

func (m *ThoughtPicker) Move(delta int) {
	if len(m.options) == 0 {
		return
	}
	m.selected = (m.selected + delta + len(m.options)) % len(m.options)
}

func (m ThoughtPicker) Selected() ThoughtOption {
	if len(m.options) == 0 {
		return ThoughtOption{}
	}
	return m.options[m.selected]
}

func (m ThoughtPicker) SelectedPosition() int {
	return m.selected
}

func (m ThoughtPicker) View(width, height int) string {
	width = max(20, width)
	height = max(4, height)
	if len(m.options) == 0 {
		return lipgloss.JoinVertical(
			lipgloss.Left,
			theme.Header.Render("Thoughts"),
			theme.Subtle.Render("No thinking blocks in this conversation."),
		)
	}

	visible := height - 2
	if visible < 1 {
		visible = 1
	}
	if m.selected < m.offset {
		m.offset = m.selected
	}
	if m.selected >= m.offset+visible {
		m.offset = m.selected - visible + 1
	}

	rows := make([]string, 0, visible+2)
	rows = append(rows, theme.Header.Render("Thoughts"))
	for index := m.offset; index < len(m.options) && index < m.offset+visible; index++ {
		option := m.options[index]
		prefix := "  "
		if index == m.selected {
			prefix = "› "
		}
		state := "▸"
		if !option.Collapsed {
			state = "▾"
		}
		preview := thoughtOptionPreview(option.Preview, width-8)
		line := prefix + state + " " + preview
		if index == m.selected {
			line = theme.PickerSelected.Render(line)
		}
		rows = append(rows, line)
	}
	rows = append(rows, theme.Subtle.Render("↑/↓ move · enter toggle · space toggle · a all · esc close"))

	return lipgloss.NewStyle().Width(width).Render(strings.Join(rows, "\n"))
}

func thoughtOptionPreview(content string, width int) string {
	content = surface.Sanitize(content)
	content = strings.TrimSpace(content)
	if content == "" {
		return "(empty thought)"
	}
	if index := strings.IndexByte(content, '\n'); index >= 0 {
		content = content[:index]
	}
	content = strings.Join(strings.Fields(content), " ")
	runes := []rune(content)
	if len(runes) <= width {
		return content
	}
	if width <= 1 {
		return "…"
	}
	return string(runes[:width-1]) + "…"
}
