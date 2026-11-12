// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"strings"

	slashmenu "github.com/GordenArcher/axon-core/internal/agentcli/tui/components/slash"
	tea "github.com/charmbracelet/bubbletea"
)

var slashCommands = []slashmenu.Command{
	{Name: "new", Description: "Start a new conversation"},
	{Name: "model", Description: "Choose the active model"},
	{Name: "resume", Description: "Resume a saved conversation"},
	{Name: "select", Description: "Enter selection mode for copy"},
	{Name: "status", Description: "Show session details"},
	{Name: "clear", Description: "Clear the transcript and start new"},
	{Name: "help", Description: "Show commands and keys"},
	{Name: "quit", Description: "Exit Axon"},
}

// refreshSlashMenu opens the command menu only while the composer contains a
// bare slash command. A space means the user is typing arguments, so the menu
// gets out of the way.
func (m *Model) refreshSlashMenu() {
	value := strings.TrimSpace(m.textarea.Value())
	if !strings.HasPrefix(value, "/") || strings.ContainsAny(value, " \n") {
		m.closeSlashMenu()
		return
	}

	menu := slashmenu.New(slashCommands, strings.TrimPrefix(value, "/"))
	if menu.Len() == 0 {
		m.closeSlashMenu()
		return
	}

	oldHeight := 0
	if m.slashOpen {
		oldHeight = m.slashMenu.Height()
	}
	m.slashMenu = menu
	m.slashOpen = true
	if oldHeight != menu.Height() {
		m.layout()
	}
}

func (m *Model) closeSlashMenu() {
	if !m.slashOpen {
		return
	}
	m.slashOpen = false
	m.layout()
}

func (m Model) runSlashSelection() (tea.Model, tea.Cmd) {
	command, ok := m.slashMenu.Selected()
	if !ok {
		return m, nil
	}
	m.slashOpen = false
	m.textarea.Reset()
	m.layout()
	return m.handleSlash("/" + command.Name)
}
