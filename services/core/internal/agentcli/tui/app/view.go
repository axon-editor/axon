// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/transcript"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
	"github.com/charmbracelet/lipgloss"
)

func (m *Model) layout() {
	if m.width <= 0 || m.height <= 0 {
		return
	}

	composerHeight := m.textarea.Height() + 2
	// Header, status line, composer, workspace path, and one line of slack.
	viewportHeight := m.height - 1 - 1 - composerHeight - 1 - 1
	if viewportHeight < 3 {
		viewportHeight = 3
	}

	m.viewport.Width = max(20, m.width)
	m.viewport.Height = viewportHeight
	m.textarea.SetWidth(max(20, m.width-4))
	m.ensureRenderer()
	m.renderer.SetWidth(m.viewport.Width)
	m.updateTranscript()
}

func (m *Model) updateTranscript() {
	m.ensureRenderer()
	wasAtBottom := m.viewport.AtBottom()
	m.viewport.SetContent(m.renderer.Render(m.messages, m.activeMessage()))
	if wasAtBottom {
		m.viewport.GotoBottom()
	}
}

// ensureRenderer keeps tests and any future lightweight model construction from
// panicking before NewModel has run. The renderer has no state worth delaying.
func (m *Model) ensureRenderer() {
	if m.renderer == nil {
		m.renderer = transcript.New()
		m.renderer.SetWidth(m.viewport.Width)
	}
}

// activeMessage returns the assistant block that should show the live cursor.
// Thinking and tool rows never carry it, even while the turn is streaming.
func (m Model) activeMessage() int {
	if !m.streaming || len(m.messages) == 0 {
		return -1
	}
	last := len(m.messages) - 1
	if m.messages[last].Thinking || m.messages[last].Role != "assistant" {
		return -1
	}
	return last
}

func (m Model) View() string {
	if m.width <= 0 || m.height <= 0 {
		return theme.Subtle.Render("Loading Axon...")
	}

	header := theme.Header.Render("AXON")

	transcript := m.viewport.View()
	if m.approvalOpen {
		transcript = m.approval.View(m.viewport.Width, m.viewport.Height)
	} else if m.thoughtOpen {
		transcript = m.thoughtPicker.View(m.viewport.Width, m.viewport.Height)
	} else if m.sessionPickerOpen {
		transcript = m.sessionPicker.View(m.viewport.Width, m.viewport.Height)
	} else if m.pickerOpen {
		transcript = m.picker.View(m.viewport.Width, m.viewport.Height)
	}

	parts := []string{
		header,
		transcript,
		m.renderStatusLine(),
		m.renderComposer(),
		theme.Subtle.Render(truncatePath(m.workspace, max(8, m.width))),
	}

	return lipgloss.JoinVertical(lipgloss.Left, parts...)
}

func (m Model) renderStatusLine() string {
	markStyle := theme.Status
	if m.streaming {
		switch m.pulse % 3 {
		case 0:
			markStyle = theme.AxonCyan
		case 1:
			markStyle = theme.AxonTeal
		case 2:
			markStyle = theme.AxonGreen
		}
	}
	if m.status == "Error" {
		markStyle = theme.Error
	}

	statusStyle := theme.Status
	if m.streaming {
		statusStyle = theme.StatusActive
	} else if m.status == "Error" {
		statusStyle = theme.Error
	}
	if m.approvalOpen {
		statusStyle = theme.ToolActive
	}

	return markStyle.Render("Λ▴") + " " + statusStyle.Render(m.status)
}

func (m Model) renderComposer() string {
	width := max(20, m.width)
	innerWidth := max(16, width-4)
	modelLabel := truncateLabel(m.modelID, max(8, width-16))

	topLeft := theme.CircuitBorder.Render("⌜ ") +
		theme.CircuitMeta.Render("agent") +
		theme.CircuitBorder.Render(" ")
	topRight := theme.CircuitBorder.Render(" ") +
		theme.CircuitMeta.Render(modelLabel) +
		theme.CircuitBorder.Render(" ⌝")
	topFill := width - lipgloss.Width(topLeft) - lipgloss.Width(topRight)
	if topFill < 1 {
		topRight = theme.CircuitBorder.Render(" ⌝")
		topFill = width - lipgloss.Width(topLeft) - lipgloss.Width(topRight)
	}
	top := topLeft + theme.CircuitBorder.Render(strings.Repeat("─", max(1, topFill))) + topRight

	lines := strings.Split(m.textarea.View(), "\n")
	height := m.textarea.Height()
	rows := make([]string, 0, height)
	for index := 0; index < height; index++ {
		line := ""
		if index < len(lines) {
			line = lines[index]
		}
		padding := innerWidth - lipgloss.Width(line)
		if padding < 0 {
			padding = 0
		}

		railStyle := theme.AxonTeal
		if m.streaming && height > 0 && index == m.pulse%height {
			railStyle = theme.AxonCyan
		}
		row := railStyle.Render("┃") +
			" " + line + strings.Repeat(" ", padding) + " " +
			theme.CircuitBorder.Render("│")
		rows = append(rows, row)
	}

	hints := "enter send · ⇧↵ newline · ⌃T thoughts · ⌃O output · ⌃C quit"
	if width < 86 {
		hints = "enter send · ⌃C quit"
	}
	bottomLeft := theme.CircuitBorder.Render("⌞ ") +
		theme.CircuitMeta.Render(hints) +
		theme.CircuitBorder.Render(" ")
	bottomRight := theme.CircuitBorder.Render("⌟")
	bottomFill := width - lipgloss.Width(bottomLeft) - lipgloss.Width(bottomRight)
	if bottomFill < 1 {
		bottomFill = 1
	}
	bottom := bottomLeft + theme.CircuitBorder.Render(strings.Repeat("─", bottomFill)) + bottomRight

	return strings.Join(append(append([]string{top}, rows...), bottom), "\n")
}

func truncateLabel(value string, width int) string {
	if width <= 0 {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= width {
		return value
	}
	if width <= 1 {
		return string(runes[:width])
	}
	return string(runes[:width-1]) + "…"
}

// truncatePath keeps the tail of a path because the last folder is the useful
// part when the terminal is narrower than the workspace path.
func truncatePath(value string, width int) string {
	if width <= 0 {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= width {
		return value
	}
	if width <= 1 {
		return "…"
	}
	return "…" + string(runes[len(runes)-(width-1):])
}
