// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
)

// Update is the top-level event router. Overlays get first refusal on keys so
// typing in the textarea cannot leak into an open picker.
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.layout()
		return m, nil

	case tea.KeyMsg:
		if msg.String() == "ctrl+c" {
			if m.cancel != nil {
				m.cancel()
			}
			return m, tea.Quit
		}
		if m.approvalOpen {
			return m.updateApproval(msg)
		}
		if m.thoughtOpen {
			return m.updateThoughtPicker(msg)
		}
		if m.sessionPickerOpen {
			return m.updateSessionPicker(msg)
		}
		if m.pickerOpen {
			return m.updatePicker(msg)
		}

		switch msg.String() {
		case "esc":
			if m.streaming && m.cancel != nil {
				m.cancel()
				m.status = "Cancelling..."
			} else {
				m.textarea.Reset()
			}
			return m, nil
		case "enter":
			if m.streaming {
				return m, nil
			}
			return m.sendPrompt(m.textarea.Value())
		case "pgup":
			m.viewport.ViewUp()
			return m, nil
		case "pgdown":
			m.viewport.ViewDown()
			return m, nil
		case "ctrl+t":
			m.openThoughtPicker()
			return m, nil
		case "ctrl+o":
			m.toggleToolOutput()
			m.updateTranscript()
			return m, nil
		}

		var command tea.Cmd
		m.textarea, command = m.textarea.Update(msg)
		return m, command

	case tea.MouseMsg:
		if msg.Button == tea.MouseButtonWheelUp {
			m.viewport.ScrollUp(m.viewport.MouseWheelDelta)
		}
		if msg.Button == tea.MouseButtonWheelDown {
			m.viewport.ScrollDown(m.viewport.MouseWheelDelta)
		}
		return m, nil

	case streamEventMsg:
		return m.handleStreamEvent(msg.event)

	case spinner.TickMsg:
		if m.streaming {
			m.pulse++
		}
		var command tea.Cmd
		m.spinner, command = m.spinner.Update(msg)
		return m, command
	}

	return m, nil
}
