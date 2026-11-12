// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"github.com/GordenArcher/axon-core/internal/agentcli/configstore"
	tea "github.com/charmbracelet/bubbletea"
)

func (m Model) updateSessionPicker(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc":
		if m.sessionPicker.Query() != "" {
			m.sessionPicker.ClearQuery()
			return m, nil
		}
		m.sessionPickerOpen = false
		m.status = "Ready"
	case "up":
		m.sessionPicker.Move(-1)
	case "down":
		m.sessionPicker.Move(1)
	case "enter":
		if id := m.sessionPicker.SelectedID(); id != "" {
			m.sessionPickerOpen = false
			// loadSession owns the success and failure status. Overwriting it
			// here would hide a database read error behind "Ready".
			m.loadSession(id)
			return m, nil
		}
	case "backspace", "ctrl+h":
		m.sessionPicker.Backspace()
	case "ctrl+u":
		m.sessionPicker.ClearQuery()
	case " ":
		m.sessionPicker.AppendQuery(" ")
	default:
		if msg.Type == tea.KeyRunes && len(msg.Runes) > 0 {
			m.sessionPicker.AppendQuery(string(msg.Runes))
		}
	}
	return m, nil
}

func (m Model) updatePicker(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc":
		m.pickerOpen = false
		m.status = "Ready"
	case "up", "k":
		m.picker.Move(-1)
	case "down", "j":
		m.picker.Move(1)
	case "enter":
		if id := m.picker.SelectedID(); id != "" {
			if !m.picker.SelectedAvailable() {
				m.status = "Model is not installed"
				return m, nil
			}
			backend, _, _ := resolveModelRoute(m.models, id)
			// A provider session id only means something to the backend that
			// issued it. Switching away from OpenCode clears it so the next
			// turn starts a fresh provider session with the CLI transcript
			// instead of trying to resume an id the new backend never saw.
			if backend != m.sessionBackend {
				m.backendSessionID = ""
				m.sessionBackend = backend
			}
			m.modelID = id
			_ = configstore.Save(configstore.Config{SelectedModel: id})
		}
		m.status = "Ready"
		m.pickerOpen = false
	}
	return m, nil
}
