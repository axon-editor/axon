// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package slash

import (
	"sort"
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/fuzzy"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
	"github.com/charmbracelet/lipgloss"
)

const descriptionPenalty = 500

type Command struct {
	Name        string
	Description string
	// Aliases are alternate names the menu can match. They do not appear in the
	// list, so the canonical command stays the one the user learns.
	Aliases []string
}

// Menu keeps the filtered command list and the highlighted row. Filtering the
// catalog here means the composer only has to supply the raw text after the
// slash, not parse it into a query itself.
type Menu struct {
	commands []Command
	selected int
}

func New(commands []Command, query string) Menu {
	query = strings.TrimSpace(strings.TrimPrefix(query, "/"))
	if query == "" {
		return Menu{commands: commands}
	}

	type candidate struct {
		command Command
		score   int
		index   int
	}
	candidates := make([]candidate, 0, len(commands))
	for index, command := range commands {
		score, ok := commandScore(command, query)
		if !ok {
			continue
		}
		candidates = append(candidates, candidate{
			command: command,
			score:   score,
			index:   index,
		})
	}
	sort.SliceStable(candidates, func(left, right int) bool {
		if candidates[left].score != candidates[right].score {
			return candidates[left].score > candidates[right].score
		}
		return candidates[left].index < candidates[right].index
	})

	filtered := make([]Command, 0, len(candidates))
	for _, result := range candidates {
		filtered = append(filtered, result.command)
	}
	return Menu{commands: filtered}
}

// commandScore prefers a name or alias hit over a description hit. Without the
// penalty a query like "new" could rank a description containing the word
// above the command actually named new.
func commandScore(command Command, query string) (int, bool) {
	best := -1
	for _, field := range append([]string{command.Name}, command.Aliases...) {
		if score, ok := fuzzy.Score(query, field); ok && score > best {
			best = score
		}
	}
	if best >= 0 {
		return best, true
	}
	if score, ok := fuzzy.Score(query, command.Description); ok {
		return score - descriptionPenalty, true
	}
	return 0, false
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
