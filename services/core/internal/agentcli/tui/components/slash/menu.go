// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package slash

import (
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
	"github.com/charmbracelet/lipgloss"
)

type Command struct {
	Name        string
	Description string
}

type Menu struct {
	commands []Command
	selected int
}

func New(commands []Command, query string) Menu {
	query = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(query, "/")))
	filtered := make([]Command, 0, len(commands))
	for _, command := range commands {
		if query == "" || strings.HasPrefix(strings.ToLower(command.Name), query) {
			filtered = append(filtered, command)
		}
	}
	return Menu{commands: filtered}
}

func (m *Menu) Move(delta int) {
	if len(m.commands) == 0 {
		return
	}
	m.selected = (m.selected + delta + len(m.commands)) % len(m.commands)
}

func (m Menu) Selected() (Command, bool) {
	if len(m.commands) == 0 {
		return Command{}, false
	}
	return m.commands[m.selected], true
}

func (m Menu) Len() int {
	return len(m.commands)
}

func (m Menu) Height() int {
	visible := m.Len()
	if visible > 6 {
		visible = 6
	}
	return visible + 2
}

func (m Menu) View(width int) string {
	width = max(20, width)
	visible := m.Len()
	if visible > 6 {
		visible = 6
	}

	rows := make([]string, 0, visible+2)
	rows = append(rows, theme.Header.Render("Commands"))
	nameWidth := 14
	for index := 0; index < visible; index++ {
		command := m.commands[index]
		prefix := "  "
		if index == m.selected {
			prefix = "› "
		}
		name := "/" + command.Name
		namePadding := max(1, nameWidth-lipgloss.Width(name))
		description := command.Description
		available := width - 2 - nameWidth
		description = truncate(description, max(8, available))

		if index == m.selected {
			line := prefix + name + strings.Repeat(" ", namePadding) + description
			line += strings.Repeat(" ", max(0, width-lipgloss.Width(line)))
			rows = append(rows, theme.PickerSelected.Render(line))
			continue
		}
		rows = append(rows, prefix+name+strings.Repeat(" ", namePadding)+
			theme.Subtle.Render(description))
	}
	rows = append(rows, theme.Subtle.Render("↑/↓ move · tab complete · enter run"))
	return lipgloss.NewStyle().Width(width).Render(strings.Join(rows, "\n"))
}

func truncate(value string, width int) string {
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
