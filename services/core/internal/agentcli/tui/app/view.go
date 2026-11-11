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
	// Header, a blank line, status, a blank line, composer, hints, and path.
	viewportHeight := m.height - 1 - 3 - composerHeight - 1 - 1
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
	thoughtID, toolID := "", ""
	if m.streaming && len(m.messages) > 0 {
		last := m.messages[len(m.messages)-1]
		if last.Thinking && !last.Collapsed {
			thoughtID = last.ID
		}
		if last.Tool != nil && last.Tool.Running {
			toolID = last.Tool.CallID
		}
	}
	m.renderer.SetActivity(m.spinner.View(), thoughtID, toolID)

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
	if overlay, ok := m.overlayView(); ok {
		return overlay
	}

	parts := []string{
		m.renderHeader(),
		m.viewport.View(),
		"",
		m.renderStatusLine(),
		"",
		m.renderComposer(),
		m.renderComposerHints(),
		theme.Subtle.Render(truncatePath(m.workspace, max(8, m.width))),
	}

	return lipgloss.JoinVertical(lipgloss.Left, parts...)
}

// overlayView owns the whole screen. A session picker or approval prompt must
// never leave the composer visible behind it.
func (m Model) overlayView() (string, bool) {
	switch {
	case m.approvalOpen:
		return m.approval.View(m.width, m.height), true
	case m.thoughtOpen:
		return m.thoughtPicker.View(m.width, m.height), true
	case m.sessionPickerOpen:
		return m.sessionPicker.View(m.width, m.height), true
	case m.pickerOpen:
		return m.picker.View(m.width, m.height), true
	default:
		return "", false
	}
}

func (m Model) renderHeader() string {
	left := theme.Header.Render("axon")
	right := theme.Subtle.Render(truncateLabel(m.modelID, max(8, m.width/3)))
	gap := m.width - lipgloss.Width(left) - lipgloss.Width(right)
	if gap < 1 {
		return left
	}
	return left + strings.Repeat(" ", gap) + right
}

func (m Model) renderStatusLine() string {
	if m.selectMode {
		return theme.ToolActive.Render(
			"· Selection mode · drag to copy · Ctrl+Y to return",
		)
	}
	// Once answer text is streaming, the answer itself is the activity. Keeping
	// a second "Working" line below it makes the screen noisy, so drop it.
	if m.streaming && (m.responding || m.hasContextualActivity()) {
		return ""
	}
	if m.streaming {
		return m.spinner.View() + " " + theme.StatusActive.Render("Working...")
	}

	status := m.status
	if status == "" {
		status = "Ready"
	}
	status = truncateLabel(status, max(8, m.width-2))
	style := theme.Status
	if status == "Error" {
		style = theme.Error
	}
	return style.Render("·") + " " + style.Render(status)
}

// hasContextualActivity reports whether the active thought or tool already owns
// the loader. The bottom Working line is only for the gap before the first
// content arrives; after that the loader belongs to the thought or tool card.
func (m Model) hasContextualActivity() bool {
	if len(m.messages) == 0 {
		return false
	}
	last := m.messages[len(m.messages)-1]
	if last.Thinking && last.Content != "" {
		return true
	}
	return last.Tool != nil && (last.Tool.Running || last.Tool.Waiting)
}

func (m Model) renderComposer() string {
	width := max(20, m.width)
	innerWidth := max(16, width-4)
	border := theme.CircuitBorder

	top := border.Render(
		"╭" + strings.Repeat("─", max(1, width-2)) + "╮",
	)
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
		rows = append(rows, border.Render("│")+
			" "+line+strings.Repeat(" ", padding)+" "+
			border.Render("│"))
	}
	bottom := border.Render(
		"╰" + strings.Repeat("─", max(1, width-2)) + "╯",
	)
	return strings.Join(
		append(append([]string{top}, rows...), bottom),
		"\n",
	)
}

func (m Model) renderComposerHints() string {
	hints := "enter send · ⇧↵ newline · esc cancel · ⌃T thoughts · ⌃O output · ⌃Y select"
	if m.width < 110 {
		hints = "enter send · esc cancel · ⌃C quit"
	}
	hints = truncateLabel(hints, max(8, m.width))
	if padding := m.width - lipgloss.Width(hints); padding > 0 {
		hints = strings.Repeat(" ", padding) + hints
	}
	return theme.Subtle.Render(hints)
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
