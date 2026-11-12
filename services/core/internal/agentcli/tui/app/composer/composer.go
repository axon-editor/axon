// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package composer

import (
	"strings"

	slashmenu "github.com/GordenArcher/axon-core/internal/agentcli/tui/components/slash"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/textarea"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// State owns the textarea and the slash menu. Prompt submission stays in the
// screen model because it has to touch the session, transcript, and agent
// runtime together, but everything that is only about typing lives here.
type State struct {
	Input textarea.Model
	Menu  slashmenu.Menu
	Open  bool
}

// New builds the composer once. The textarea owns multiline editing and the
// slash menu is derived from its value, so there is no separate command input
// mode to enter or leave.
func New() State {
	input := textarea.New()
	input.Placeholder = "Ask Axon..."
	// The Axon mark is the prompt, not a generic shell chevron. It also keeps
	// user turns and the composer visually tied to the product.
	input.Prompt = "Λ "
	input.SetPromptFunc(2, func(line int) string {
		if line == 0 {
			return "Λ "
		}
		return "  "
	})
	// The textarea's default cursor line paints a background behind the line
	// being typed. The composer should stay transparent.
	input.FocusedStyle.CursorLine = lipgloss.NewStyle()
	input.BlurredStyle.CursorLine = lipgloss.NewStyle()
	input.FocusedStyle.Prompt = theme.Prompt
	input.BlurredStyle.Prompt = theme.Prompt
	input.FocusedStyle.Placeholder = theme.Subtle
	input.FocusedStyle.Text = theme.Foreground
	input.CharLimit = 0
	input.ShowLineNumbers = false
	input.SetHeight(3)
	input.SetWidth(80)
	// Enter sends the prompt; Shift+Enter and friends keep the multiline escape
	// hatch users expect from a terminal agent.
	input.KeyMap.InsertNewline = key.NewBinding(
		key.WithKeys("shift+enter", "alt+enter", "ctrl+j"),
		key.WithHelp("shift+enter", "newline"),
	)
	_ = input.Focus()
	return State{Input: input}
}

func (c State) Value() string {
	return c.Input.Value()
}

// Reset clears the textarea and closes the menu together. Leaving the menu open
// after sending would draw a stale list over the next turn.
func (c *State) Reset() {
	c.Input.Reset()
	c.CloseMenu()
}

// SetValue exists for Tab completion, where the command replaces the current
// prefix and the menu must immediately narrow to that one command.
func (c *State) SetValue(value string) bool {
	c.Input.SetValue(value)
	c.Input.CursorEnd()
	return c.RefreshMenu()
}

// Update forwards a key or paste to the textarea and refreshes the menu from
// the new value. The caller keeps the returned command so cursor blinking and
// other textarea messages still run.
func (c *State) Update(msg tea.Msg) tea.Cmd {
	var command tea.Cmd
	c.Input, command = c.Input.Update(msg)
	c.RefreshMenu()
	return command
}

// RefreshMenu reports whether its height changed. The screen model only needs
// to relayout in that case; repainting on every keystroke would fight the
// textarea's own cursor movement.
func (c *State) RefreshMenu() bool {
	value := strings.TrimSpace(c.Input.Value())
	if !strings.HasPrefix(value, "/") || strings.ContainsAny(value, " \n") {
		return c.CloseMenu()
	}

	menu := slashmenu.New(slashCommands, strings.TrimPrefix(value, "/"))
	if menu.Len() == 0 {
		return c.CloseMenu()
	}

	wasOpen := c.Open
	oldHeight := 0
	if wasOpen {
		oldHeight = c.Menu.Height()
	}
	c.Menu = menu
	c.Open = true
	return !wasOpen || oldHeight != menu.Height()
}

func (c *State) CloseMenu() bool {
	if !c.Open {
		return false
	}
	c.Open = false
	return true
}

func (c *State) MoveMenu(delta int) {
	c.Menu.Move(delta)
}

func (c State) SelectedCommand() (slashmenu.Command, bool) {
	return c.Menu.Selected()
}

func (c State) Height() int {
	return c.Input.Height()
}
