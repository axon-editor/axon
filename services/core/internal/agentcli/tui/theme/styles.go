// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package theme

import "github.com/charmbracelet/lipgloss"

// Shared palette values. Keep the hex strings here so glamour, which needs raw
// colour strings, and lipgloss use the same tokens as the rest of the TUI.
const (
	HexCyan           = "#75d1ff"
	HexTeal           = "#4fd1c5"
	HexGreen          = "#a6e3a1"
	HexMuted          = "#586478"
	HexText           = "#c8d0e0"
	HexBright         = "#e6edf8"
	HexError          = "#ff7f9f"
	HexUserSurface    = "#1c2940"
	HexModelSurface   = "#0f151d"
	HexThoughtSurface = "#0b1017"
	HexCodeSurface    = "#080c12"
	HexInlineSurface  = "#1b2432"
	HexToolSurface    = "#0b1118"
)

// Axon Dark palette. Keeping the CLI tied to the editor tokens means the
// terminal agent and the desktop surface feel like the same product.
var (
	Header         = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color(HexCyan))
	Subtle         = lipgloss.NewStyle().Foreground(lipgloss.Color(HexMuted))
	Foreground     = lipgloss.NewStyle().Foreground(lipgloss.Color(HexText))
	Error          = lipgloss.NewStyle().Foreground(lipgloss.Color(HexError))
	Prompt         = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color(HexCyan))
	CircuitBorder  = lipgloss.NewStyle().Foreground(lipgloss.Color("#222838"))
	CircuitMeta    = lipgloss.NewStyle().Foreground(lipgloss.Color(HexMuted))
	Status         = lipgloss.NewStyle().Foreground(lipgloss.Color(HexMuted))
	StatusActive   = lipgloss.NewStyle().Foreground(lipgloss.Color(HexTeal))
	Thinking       = lipgloss.NewStyle().Foreground(lipgloss.Color(HexMuted)).Italic(true)
	ThinkingHead   = lipgloss.NewStyle().Foreground(lipgloss.Color(HexTeal)).Italic(true)
	PickerSelected = lipgloss.NewStyle().
			Background(lipgloss.Color("#151923")).
			Foreground(lipgloss.Color(HexCyan))
	AxonCyan   = lipgloss.NewStyle().Foreground(lipgloss.Color(HexCyan))
	AxonTeal   = lipgloss.NewStyle().Foreground(lipgloss.Color(HexTeal))
	AxonGreen  = lipgloss.NewStyle().Foreground(lipgloss.Color(HexGreen))
	Cursor     = lipgloss.NewStyle().Foreground(lipgloss.Color(HexCyan))
	ToolName   = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color(HexTeal))
	ToolMeta   = lipgloss.NewStyle().Foreground(lipgloss.Color(HexMuted))
	ToolOK     = lipgloss.NewStyle().Foreground(lipgloss.Color(HexGreen))
	ToolError  = lipgloss.NewStyle().Foreground(lipgloss.Color(HexError))
	ToolActive = lipgloss.NewStyle().Foreground(lipgloss.Color(HexCyan))
	ToolResult = lipgloss.NewStyle().Foreground(lipgloss.Color(HexText))
)

// Message surfaces are colours, not styles, because the block renderer paints
// them after markdown so inner resets cannot punch holes in the background.
var (
	UserSurface    = lipgloss.Color(HexUserSurface)
	ModelSurface   = lipgloss.Color(HexModelSurface)
	ThoughtSurface = lipgloss.Color(HexThoughtSurface)
	ToolSurface    = lipgloss.Color(HexToolSurface)
)
