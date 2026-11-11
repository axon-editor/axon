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
	case "enter":
		option := m.thoughtPicker.Selected()
		m.toggleSelectedThought()
		// Closing on Enter is deliberate: the picker only has room for previews,
		// so the expanded reasoning is visible only after returning to the
		// transcript.
		m.thoughtOpen = false
		m.status = "Ready"
		m.updateTranscript()
		m.scrollToMessage(option.Index)
	case " ":
		m.toggleSelectedThought()
		m.rebuildThoughtPicker(m.thoughtPicker.SelectedPosition())
		m.updateTranscript()
	case "a":
		option := m.thoughtPicker.Selected()
		m.toggleThinking()
		m.thoughtOpen = false
		m.status = "Ready"
		m.updateTranscript()
		m.scrollToMessage(option.Index)
	}
	return m, nil
}

// scrollToMessage puts an expanded thought back on screen after the picker
// closes. Without it a long transcript stays pinned to the bottom and the
// reasoning the user just opened is still invisible.
func (m *Model) scrollToMessage(index int) {
	if index < 0 || index >= len(m.messages) || m.renderer == nil {
		return
	}
	id := m.messages[index].ID
	if id == "" {
		return
	}
	if offset, ok := m.renderer.OffsetFor(id); ok {
		m.viewport.SetYOffset(max(0, offset-1))
	}
}

func (m *Model) toggleSelectedThought() {
	option := m.thoughtPicker.Selected()
	if option.Index < 0 || option.Index >= len(m.messages) ||
		!m.messages[option.Index].Thinking {
		return
	}
	m.messages[option.Index].Collapsed = !m.messages[option.Index].Collapsed
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
