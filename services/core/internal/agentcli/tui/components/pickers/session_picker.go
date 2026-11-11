// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package pickers

import (
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
	"github.com/charmbracelet/lipgloss"
)

type SessionOption struct {
	ID      string
	Title   string
	Model   string
	Source  string
	Updated string
	Current bool
}

type SessionPicker struct {
	options  []SessionOption
	query    string
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
	matches := m.matches()
	if len(matches) == 0 {
		return
	}
	m.selected = (m.selected + delta + len(matches)) % len(matches)
}

func (m SessionPicker) SelectedID() string {
	matches := m.matches()
	if len(matches) == 0 {
		return ""
	}
	if m.selected >= len(matches) {
		return matches[len(matches)-1].ID
	}
	return matches[m.selected].ID
}

func (m SessionPicker) Query() string {
	return m.query
}

func (m *SessionPicker) AppendQuery(value string) {
	if value == "" {
		return
	}
	m.query += value
	m.resetSelection()
}

func (m *SessionPicker) Backspace() {
	if m.query == "" {
		return
	}
	runes := []rune(m.query)
	m.query = string(runes[:len(runes)-1])
	m.resetSelection()
}

func (m *SessionPicker) ClearQuery() {
	if m.query == "" {
		return
	}
	m.query = ""
	m.resetSelection()
}

func (m *SessionPicker) resetSelection() {
	m.selected = 0
	m.offset = 0
}

func (m SessionPicker) matches() []SessionOption {
	query := strings.ToLower(strings.TrimSpace(m.query))
	if query == "" {
		return m.options
	}
	matches := make([]SessionOption, 0, len(m.options))
	for _, option := range m.options {
		title := strings.ToLower(option.Title)
		model := strings.ToLower(option.Model)
		if strings.Contains(title, query) || strings.Contains(model, query) {
			matches = append(matches, option)
		}
	}
	return matches
}

func (m SessionPicker) View(width, height int) string {
	width = max(20, width)
	height = max(4, height)
	matches := m.matches()

	visible := height - 3
	if visible < 1 {
		visible = 1
	}
	if m.selected < m.offset {
		m.offset = m.selected
	}
	if m.selected >= m.offset+visible {
		m.offset = m.selected - visible + 1
	}

	rows := make([]string, 0, visible+3)
	rows = append(rows, theme.Header.Render("Sessions"))
	rows = append(rows, m.renderSearch())
	if len(matches) == 0 {
		rows = append(rows, theme.Subtle.Render("No matching sessions."))
	} else {
		for index := m.offset; index < len(matches) && index < m.offset+visible; index++ {
			rows = append(rows, m.renderOption(matches[index], index == m.selected, width))
		}
	}
	if m.query == "" {
		rows = append(rows, theme.Subtle.Render(
			"type to search · ↑/↓ move · enter resume · esc close",
		))
	} else {
		rows = append(rows, theme.Subtle.Render(
			"↑/↓ move · enter resume · esc clear search",
		))
	}
	return lipgloss.NewStyle().Width(width).Render(strings.Join(rows, "\n"))
}

func (m SessionPicker) renderSearch() string {
	label := theme.Subtle.Render("Search  ")
	if m.query == "" {
		return label + theme.Subtle.Render("type to filter…")
	}
	return label + theme.ToolActive.Render(m.query)
}

func (m SessionPicker) renderOption(
	option SessionOption,
	selected bool,
	width int,
) string {
	meta := option.Updated
	if option.Model != "" {
		meta += " · " + option.Model
	}
	if option.Source == "editor" {
		meta += " · editor"
	}
	meta = truncateRunes(meta, max(10, width/2))

	prefix := "  "
	if selected {
		prefix = "› "
	}
	titleWidth := max(8, width-2-lipgloss.Width(meta)-2)
	title := truncateRunes(option.Title, titleWidth)
	gap := width - lipgloss.Width(prefix) - lipgloss.Width(title) - lipgloss.Width(meta) - 1
	if gap < 1 {
		gap = 1
	}

	if selected {
		line := prefix + title + strings.Repeat(" ", gap) + meta
		line += strings.Repeat(" ", max(0, width-lipgloss.Width(line)))
		return theme.PickerSelected.Render(line)
	}
	return prefix + title + strings.Repeat(" ", gap) + theme.Subtle.Render(meta)
}

func truncateRunes(value string, width int) string {
	if width <= 0 {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= width {
		return value
	}
	if width == 1 {
		return "…"
	}
	return string(runes[:width-1]) + "…"
}
