// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package thought

import (
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/transcript/surface"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
	"github.com/charmbracelet/lipgloss"
)

// Option is one reasoning block. Index is the message position in the
// transcript, not the picker position, because Enter has to open the block the
// user highlighted rather than whichever block happens to be first.
type Option struct {
	Index     int
	Preview   string
	Collapsed bool
}

// Picker scrolls independently of the transcript. The transcript viewport can
// be far from the block being inspected, so the picker owns its own offset.
type Picker struct {
	options  []Option
	selected int
	offset   int
}

// New clamps the requested position because thoughts can be removed between
// opening the picker and rebuilding it after a toggle.
func New(options []Option, selected int) Picker {
	picker := Picker{options: options}
	if selected >= 0 && selected < len(options) {
		picker.selected = selected
	}
	return picker
}

// Move wraps so holding Up from the first thought lands on the last one, which
// is usually the block the user wants when inspecting a finished turn.
func (m *Picker) Move(delta int) {
	if len(m.options) == 0 {
		return
	}
	m.selected = (m.selected + delta + len(m.options)) % len(m.options)
}

// Selected returns an empty option when there are no thoughts. Callers use the
// empty preview as the signal to fall back to a status message.
func (m Picker) Selected() Option {
	if len(m.options) == 0 {
		return Option{}
	}
	return m.options[m.selected]
}

// SelectedPosition is the picker index used to rebuild the list after a toggle.
// The transcript index moves when blocks collapse, so the position is not a
// stable identifier for the highlighted thought.
func (m Picker) SelectedPosition() int {
	return m.selected
}

func (m Picker) View(width, height int) string {
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
		preview := optionPreview(option.Preview, width-8)
		line := prefix + state + " " + preview
		if index == m.selected {
			line = theme.PickerSelected.Render(line)
		}
		rows = append(rows, line)
	}
	rows = append(rows, theme.Subtle.Render("↑/↓ move · enter toggle · space toggle · a all · esc close"))

	return lipgloss.NewStyle().Width(width).Render(strings.Join(rows, "\n"))
}

func optionPreview(content string, width int) string {
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
