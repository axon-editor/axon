// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

func TestSelectionModeTogglesMouseCapture(t *testing.T) {
	model := NewModel("/tmp/axon", "axon-code", nil, false, nil)
	model.width = 100
	model.height = 30
	model.layout()

	updated, command := model.Update(tea.KeyMsg{Type: tea.KeyCtrlY})
	model = updated.(Model)
	if !model.selectMode {
		t.Fatal("Ctrl+Y did not enter selection mode")
	}
	if command == nil {
		t.Fatal("selection mode did not issue a mouse-disable command")
	}
	if !strings.Contains(model.renderStatusLine(), "Selection mode") {
		t.Fatalf("selection mode status = %q", model.renderStatusLine())
	}

	updated, command = model.Update(tea.KeyMsg{Type: tea.KeyCtrlY})
	model = updated.(Model)
	if model.selectMode {
		t.Fatal("Ctrl+Y did not leave selection mode")
	}
	if command == nil {
		t.Fatal("leaving selection mode did not issue a mouse-enable command")
	}
}
