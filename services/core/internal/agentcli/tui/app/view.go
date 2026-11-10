// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"path/filepath"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
	"github.com/charmbracelet/lipgloss"
)

func (m *Model) layout() {
	if m.width <= 0 || m.height <= 0 {
		return
	}

	composerHeight := m.textarea.Height() + 2
	viewportHeight := m.height - 1 - 1 - composerHeight - 2
	if viewportHeight < 3 {
		viewportHeight = 3
	}

	m.viewport.Width = max(20, m.width)
	m.viewport.Height = viewportHeight
	m.textarea.SetWidth(max(20, m.width-6))
	m.updateTranscript()
}

func (m *Model) updateTranscript() {
	wasAtBottom := m.viewport.AtBottom()
	m.viewport.SetContent(components.Render(m.messages, m.viewport.Width))
	if wasAtBottom {
		m.viewport.GotoBottom()
	}
}

func (m Model) View() string {
	if m.width <= 0 || m.height <= 0 {
		return theme.Subtle.Render("Loading Axon...")
	}

	header := lipgloss.JoinHorizontal(
		lipgloss.Left,
		theme.Header.Render("Axon"),
		theme.Subtle.Render("  "+filepath.Base(m.workspace)),
		theme.Subtle.Render("  "+m.modelID),
	)

	statusText := theme.Status.Render("● " + m.status)
	if m.streaming {
		statusText = m.spinner.View() + " " + theme.StatusActive.Render(m.status)
	}
	hints := "enter send · shift+enter newline · ctrl+c quit"
	if m.width < 90 {
		hints = "enter send · ctrl+c quit"
	}
	status := lipgloss.JoinHorizontal(
		lipgloss.Left,
		statusText,
		theme.Subtle.Render("  "+hints),
	)

	composer := theme.Composer.
		Width(max(20, m.width-4)).
		Render(m.textarea.View())

	return lipgloss.JoinVertical(
		lipgloss.Left,
		header,
		m.viewport.View(),
		composer,
		status,
	)
}
