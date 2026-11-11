// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/pickers"
	tea "github.com/charmbracelet/bubbletea"
)

func (m *Model) openThoughtPicker() {
	options := thoughtOptions(m.messages)
	if len(options) == 0 {
		m.status = "No thoughts in this conversation"
		return
	}
	// Start on the newest thought because that is the one the user just watched
	// stream, while still exposing every earlier block in the list.
	m.thoughtPicker = pickers.NewThoughtPicker(options, len(options)-1)
	m.thoughtOpen = true
	m.status = "Thoughts"
}

func (m Model) updateThoughtPicker(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", "ctrl+t":
		m.thoughtOpen = false
		m.status = "Ready"
		m.updateTranscript()
	case "up", "k":
		m.thoughtPicker.Move(-1)
	case "down", "j":
		m.thoughtPicker.Move(1)
	case "enter", " ":
		option := m.thoughtPicker.Selected()
		if option.Index >= 0 && option.Index < len(m.messages) &&
			m.messages[option.Index].Thinking {
			m.messages[option.Index].Collapsed = !m.messages[option.Index].Collapsed
			m.rebuildThoughtPicker(m.thoughtPicker.SelectedPosition())
			m.updateTranscript()
		}
	case "a":
		m.toggleThinking()
		m.rebuildThoughtPicker(m.thoughtPicker.SelectedPosition())
		m.updateTranscript()
	}
	return m, nil
}

func (m *Model) rebuildThoughtPicker(position int) {
	m.thoughtPicker = pickers.NewThoughtPicker(
		thoughtOptions(m.messages),
		position,
	)
}

func thoughtOptions(messages []components.Message) []pickers.ThoughtOption {
	options := make([]pickers.ThoughtOption, 0)
	for index, message := range messages {
		if !message.Thinking {
			continue
		}
		options = append(options, pickers.ThoughtOption{
			Index:     index,
			Preview:   message.Content,
			Collapsed: message.Collapsed,
		})
	}
	return options
}
