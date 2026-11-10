// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package theme

import "github.com/charmbracelet/lipgloss"

// The CLI TUI deliberately uses a small palette so it reads like one surface
// instead of a themed application inside the terminal. Lip Gloss degrades the
// colors automatically when the terminal does not support truecolor.
var (
	Header       = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("42"))
	Subtle       = lipgloss.NewStyle().Foreground(lipgloss.Color("244"))
	UserLabel    = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("39"))
	Assistant    = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("42"))
	Error        = lipgloss.NewStyle().Foreground(lipgloss.Color("203"))
	Composer     = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color("238")).Padding(0, 1)
	Status       = lipgloss.NewStyle().Foreground(lipgloss.Color("244"))
	StatusActive = lipgloss.NewStyle().Foreground(lipgloss.Color("42"))
	Thinking     = lipgloss.NewStyle().Foreground(lipgloss.Color("240")).Italic(true)
	ThinkingHead = lipgloss.NewStyle().Foreground(lipgloss.Color("244")).Italic(true)
	PickerSelected = lipgloss.NewStyle().
		Background(lipgloss.Color("236")).
		Foreground(lipgloss.Color("255"))
)
