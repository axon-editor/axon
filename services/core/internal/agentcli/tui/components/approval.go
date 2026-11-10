// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package components

import (
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/transcript/surface"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
)

// Approval is the modal shown when a mutating tool needs a decision. It owns
// presentation only; the app sends the actual decision back to the agent.
type Approval struct {
	ToolName  string
	Summary   string
	Details   string
	AllowTurn bool
}

func (a Approval) View(width, height int) string {
	width = max(40, width)
	height = max(6, height)

	lines := []string{
		theme.Header.Render("Approval required"),
		"",
		theme.ToolName.Render(sanitizeInline(a.ToolName)) + "  " +
			theme.ToolMeta.Render(sanitizeInline(a.Summary)),
		"",
	}

	details := strings.Split(surface.Sanitize(a.Details), "\n")
	limit := max(3, height-9)
	if len(details) > limit {
		details = details[:limit]
		details = append(details, "…")
	}
	for _, line := range details {
		lines = append(lines, theme.ToolResult.Render(line))
	}

	lines = append(lines, "")
	lines = append(lines, theme.ToolMeta.Render(a.hints()))

	rows := surface.Block(lines, width, theme.ToolSurface)
	if len(rows) > height {
		rows = rows[:height]
	}
	return strings.Join(rows, "\n")
}

func (a Approval) hints() string {
	hints := "enter/y allow once · n/esc deny"
	if a.AllowTurn {
		hints = "enter/y allow once · a allow for this run · n/esc deny"
	}
	return hints
}

func sanitizeInline(value string) string {
	return strings.TrimSpace(strings.ReplaceAll(surface.Sanitize(value), "\n", " "))
}
