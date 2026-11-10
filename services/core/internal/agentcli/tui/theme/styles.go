// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package theme

import "github.com/charmbracelet/lipgloss"

// Axon Dark palette. Keeping the CLI tied to the editor tokens means the
// terminal agent and the desktop surface feel like the same product.
var (
	Header        = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#75d1ff"))
	Subtle        = lipgloss.NewStyle().Foreground(lipgloss.Color("#586478"))
	Foreground    = lipgloss.NewStyle().Foreground(lipgloss.Color("#c8d0e0"))
	UserLabel     = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#75d1ff"))
	Assistant     = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#4fd1c5"))
	Error         = lipgloss.NewStyle().Foreground(lipgloss.Color("#ff7f9f"))
	Prompt        = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#75d1ff"))
	CircuitBorder = lipgloss.NewStyle().Foreground(lipgloss.Color("#222838"))
	CircuitLabel  = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#75d1ff"))
	CircuitMeta   = lipgloss.NewStyle().Foreground(lipgloss.Color("#586478"))
	Status        = lipgloss.NewStyle().Foreground(lipgloss.Color("#586478"))
	StatusActive  = lipgloss.NewStyle().Foreground(lipgloss.Color("#4fd1c5"))
	Thinking      = lipgloss.NewStyle().Foreground(lipgloss.Color("#586478")).Italic(true)
	ThinkingHead  = lipgloss.NewStyle().Foreground(lipgloss.Color("#4fd1c5")).Italic(true)
	PickerSelected = lipgloss.NewStyle().
		Background(lipgloss.Color("#151923")).
		Foreground(lipgloss.Color("#75d1ff"))
	AxonCyan  = lipgloss.NewStyle().Foreground(lipgloss.Color("#75d1ff"))
	AxonTeal  = lipgloss.NewStyle().Foreground(lipgloss.Color("#4fd1c5"))
	AxonGreen = lipgloss.NewStyle().Foreground(lipgloss.Color("#a6e3a1"))
)
