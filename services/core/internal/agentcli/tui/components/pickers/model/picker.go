// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package model

import (
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
	"github.com/GordenArcher/axon-core/internal/ai"
	"github.com/charmbracelet/lipgloss"
)

// Picker renders the grouped model catalog. The selected index points into the
// row slice, headers included, so scrolling stays aligned with what is drawn;
// navigation skips the headers explicitly.
type Picker struct {
	rows      []Row
	selected  int
	currentID string
	offset    int
}

// New selects the current model when it is present. If the requested model
// disappeared from the catalog, the first selectable row becomes the anchor so
// Enter cannot land on a heading.
func New(models []ai.ModelInfo, currentID string) Picker {
	rows := groupedRows(models)
	picker := Picker{
		rows:      rows,
		currentID: currentID,
		selected:  firstModelRow(rows),
	}
	for index, row := range rows {
		if !row.Header && row.Model.ID == currentID {
			picker.selected = index
			break
		}
	}
	return picker
}

// firstModelRow exists because rows can start with a provider heading. A zero
// index would otherwise make Enter select that heading and return an empty id.
func firstModelRow(rows []Row) int {
	for index, row := range rows {
		if !row.Header {
			return index
		}
	}
	return 0
}

// Move walks by selectable rows, not by slice index. Stepping through headers
// would leave the highlight on a line that cannot be chosen and make the picker
// feel stuck on every group boundary.
func (m *Picker) Move(delta int) {
	if len(m.rows) == 0 {
		return
	}
	direction := 1
	steps := delta
	if steps < 0 {
		direction = -1
		steps = -steps
	}
	for step := 0; step < steps; step++ {
		next := m.selected
		for attempt := 0; attempt < len(m.rows); attempt++ {
			next = (next + direction + len(m.rows)) % len(m.rows)
			if !m.rows[next].Header {
				break
			}
		}
		if m.rows[next].Header {
			return
		}
		m.selected = next
	}
}

// SelectedID returns empty when the index somehow lands on a heading. The
// caller treats that as "nothing selected" instead of switching to a blank id.
func (m Picker) SelectedID() string {
	if len(m.rows) == 0 || m.selected >= len(m.rows) {
		return ""
	}
	row := m.rows[m.selected]
	if row.Header {
		return ""
	}
	return row.Model.ID
}

// SelectedAvailable keeps uninstalled Axon models visible but unselectable.
// OpenCode marks its entries available up front, so the same check covers both
// backends without a special case in the key handler.
func (m Picker) SelectedAvailable() bool {
	if len(m.rows) == 0 || m.selected >= len(m.rows) {
		return false
	}
	row := m.rows[m.selected]
	return !row.Header && row.Model.Available
}

// View keeps the selected row visible instead of recalculating group offsets.
// Rows include headings, so the scroll math matches exactly what is drawn and a
// group label never appears without the model it introduces.
func (m Picker) View(width, height int) string {
	width = max(20, width)
	height = max(4, height)
	if len(m.rows) == 0 {
		return lipgloss.JoinVertical(
			lipgloss.Left,
			theme.Header.Render("Models"),
			theme.Subtle.Render("No models reported by the runtime."),
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
	rows = append(rows, theme.Header.Render("Models"))
	for index := m.offset; index < len(m.rows) && index < m.offset+visible; index++ {
		row := m.rows[index]
		if row.Header {
			rows = append(rows, "  "+theme.Subtle.Render(row.Label))
			continue
		}

		prefix := "  "
		if index == m.selected {
			prefix = "› "
		}
		status := ""
		if !row.Model.Available {
			status = "  " + theme.Subtle.Render("not installed")
		}
		if row.Model.ID == m.currentID {
			status += "  " + theme.Subtle.Render("current")
		}
		line := prefix + row.Label + "  " + theme.Subtle.Render(row.Model.ID) + status
		if index == m.selected {
			line = theme.PickerSelected.Render(line)
		}
		rows = append(rows, line)
	}
	rows = append(rows, theme.Subtle.Render("↑/↓ move · enter select · esc close"))

	return lipgloss.NewStyle().Width(width).Render(strings.Join(rows, "\n"))
}
