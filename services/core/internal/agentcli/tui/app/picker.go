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
		m.sessionPickerOpen = false
		m.status = "Ready"
	case "up", "k":
		m.sessionPicker.Move(-1)
	case "down", "j":
		m.sessionPicker.Move(1)
	case "enter":
		m.sessionPickerOpen = false
		if id := m.sessionPicker.SelectedID(); id != "" {
			// loadSession owns the success and failure status. Overwriting it
			// here would hide a database read error behind "Ready".
			m.loadSession(id)
			return m, nil
		}
		m.status = "Ready"
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
			m.modelID = id
			_ = configstore.Save(configstore.Config{SelectedModel: id})
		}
		m.status = "Ready"
		m.pickerOpen = false
	}
	return m, nil
}
