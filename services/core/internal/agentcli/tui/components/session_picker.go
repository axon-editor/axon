// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package components

import (
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
	"github.com/charmbracelet/lipgloss"
)

type SessionOption struct {
	ID      string
	Title   string
	Model   string
	Updated string
	Current bool
}

type SessionPicker struct {
	options  []SessionOption
	selected int
	offset   int
}

func NewSessionPicker(options []SessionOption, currentID string) SessionPicker {
	picker := SessionPicker{options: options}
	for index, option := range options {
		if option.ID == currentID {
			picker.selected = index
			break
		}
	}
	return picker
}

func (m *SessionPicker) Move(delta int) {
	if len(m.options) == 0 {
		return
	}
	m.selected = (m.selected + delta + len(m.options)) % len(m.options)
}

func (m SessionPicker) SelectedID() string {
	if len(m.options) == 0 {
		return ""
	}
	return m.options[m.selected].ID
}

func (m SessionPicker) View(width, height int) string {
	width = max(20, width)
	height = max(4, height)
	if len(m.options) == 0 {
		return lipgloss.JoinVertical(
			lipgloss.Left,
			theme.Header.Render("Sessions"),
			theme.Subtle.Render("No saved conversations for this workspace."),
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
	rows = append(rows, theme.Header.Render("Sessions"))
	for index := m.offset; index < len(m.options) && index < m.offset+visible; index++ {
		option := m.options[index]
		prefix := "  "
		if index == m.selected {
			prefix = "› "
		}

		meta := option.Updated
		if option.Model != "" {
			meta += " · " + option.Model
		}
		if option.Current {
			meta += " · current"
		}

		line := prefix + option.Title + "  " + theme.Subtle.Render(meta)
		if index == m.selected {
			line = theme.PickerSelected.Render(line)
		}
		rows = append(rows, line)
	}
	rows = append(rows, theme.Subtle.Render("↑/↓ move · enter resume · esc close"))

	return lipgloss.NewStyle().Width(width).Render(strings.Join(rows, "\n"))
}
