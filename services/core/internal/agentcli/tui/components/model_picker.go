// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package components

import (
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
	"github.com/GordenArcher/axon-core/internal/ai"
	"github.com/charmbracelet/lipgloss"
)

type ModelPicker struct {
	models    []ai.ModelInfo
	selected  int
	currentID string
	offset    int
}

func NewModelPicker(models []ai.ModelInfo, currentID string) ModelPicker {
	selected := 0
	for index, model := range models {
		if model.ID == currentID {
			selected = index
			break
		}
	}
	return ModelPicker{models: models, selected: selected, currentID: currentID}
}

func (m *ModelPicker) Move(delta int) {
	if len(m.models) == 0 {
		return
	}
	m.selected = (m.selected + delta + len(m.models)) % len(m.models)
}

func (m ModelPicker) SelectedID() string {
	if len(m.models) == 0 {
		return ""
	}
	return m.models[m.selected].ID
}

func (m ModelPicker) SelectedAvailable() bool {
	if len(m.models) == 0 {
		return false
	}
	return m.models[m.selected].Available
}

func (m ModelPicker) View(width, height int) string {
	width = max(20, width)
	height = max(4, height)
	if len(m.models) == 0 {
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
	for index := m.offset; index < len(m.models) && index < m.offset+visible; index++ {
		model := m.models[index]
		prefix := "  "
		if index == m.selected {
			prefix = "› "
		}

		status := ""
		if !model.Available {
			status = "  " + theme.Subtle.Render("not installed")
		}
		if model.ID == m.currentID {
			status += "  " + theme.Subtle.Render("current")
		}

		line := prefix + model.Label + "  " + theme.Subtle.Render(model.ID) + status
		if index == m.selected {
			line = theme.PickerSelected.Render(line)
		}
		rows = append(rows, line)
	}
	rows = append(rows, theme.Subtle.Render("↑/↓ move · enter select · esc close"))

	return lipgloss.NewStyle().Width(width).Render(strings.Join(rows, "\n"))
}
