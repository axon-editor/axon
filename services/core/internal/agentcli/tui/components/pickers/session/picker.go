// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package session

import (
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
	"github.com/charmbracelet/lipgloss"
)

// Option is the display row for one saved conversation. Model and Source are
// carried separately because the picker mirrors the editor sidebar, where a
// terminal conversation and an editor conversation can sit side by side.
type Option struct {
	ID      string
	Title   string
	Model   string
	Source  string
	Updated string
	Current bool
}

// Picker keeps the query and selection together so closing the overlay and
// reopening it cannot resume an old filter that no longer matches the list.
type Picker struct {
	options  []Option
	query    string
	selected int
	offset   int
}

// New positions the highlight on the conversation the user is already in. The
// picker is also used from the startup resume screen, where that id is a fresh
// conversation and the first saved row is the useful anchor.
func New(options []Option, currentID string) Picker {
	picker := Picker{options: options}
	for index, option := range options {
		if option.ID == currentID {
			picker.selected = index
			break
		}
	}
	return picker
}

// Move wraps within the filtered list, not the full list. Using the filtered
// length means the highlight cannot disappear when a search narrows the rows.
func (m *Picker) Move(delta int) {
	matches := m.matches()
	if len(matches) == 0 {
		return
	}
	m.selected = (m.selected + delta + len(matches)) % len(matches)
}

// SelectedID clamps to the last match because a query edit can shrink the list
// before the next key event updates the selection.
func (m Picker) SelectedID() string {
	matches := m.matches()
	if len(matches) == 0 {
		return ""
	}
	if m.selected >= len(matches) {
		return matches[len(matches)-1].ID
	}
	return matches[m.selected].ID
}

// Query is exposed so the parent can clear the filter on Escape without
// knowing how the picker stores it.
func (m Picker) Query() string {
	return m.query
}

// AppendQuery resets the highlight on every keystroke. Keeping the old index
// would make Enter resume a row the user filtered away.
func (m *Picker) AppendQuery(value string) {
	if value == "" {
		return
	}
	m.query += value
	m.resetSelection()
}

// Backspace edits by rune, not byte. Session titles contain names and non-Latin
// text, and slicing a UTF-8 byte would corrupt the query on the first deletion.
func (m *Picker) Backspace() {
	if m.query == "" {
		return
	}
	runes := []rune(m.query)
	m.query = string(runes[:len(runes)-1])
	m.resetSelection()
}

// ClearQuery is separate from Backspace because Ctrl+U should return to the
// full list in one keystroke while keeping the picker open.
func (m *Picker) ClearQuery() {
	if m.query == "" {
		return
	}
	m.query = ""
	m.resetSelection()
}

// resetSelection clears the scroll offset too. Keeping the old offset after a
// filter change can start the list below the first visible result.
func (m *Picker) resetSelection() {
	m.selected = 0
	m.offset = 0
}

// matches filters on title and model, not source, because the source is already
// a badge the user can see. Searching "editor" should not hide every terminal
// conversation just because the literal word is not in the title.
func (m Picker) matches() []Option {
	query := strings.ToLower(strings.TrimSpace(m.query))
	if query == "" {
		return m.options
	}
	matches := make([]Option, 0, len(m.options))
	for _, option := range m.options {
		title := strings.ToLower(option.Title)
		model := strings.ToLower(option.Model)
		if strings.Contains(title, query) || strings.Contains(model, query) {
			matches = append(matches, option)
		}
	}
	return matches
}

func (m Picker) View(width, height int) string {
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

func (m Picker) renderSearch() string {
	label := theme.Subtle.Render("Search  ")
	if m.query == "" {
		return label + theme.Subtle.Render("type to filter…")
	}
	return label + theme.ToolActive.Render(m.query)
}

func (m Picker) renderOption(
	option Option,
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
