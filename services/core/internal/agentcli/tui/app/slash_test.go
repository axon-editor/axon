// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"strings"
	"testing"
)

func TestSlashMenuOpensAndFilters(t *testing.T) {
	model := NewModel("/tmp/axon", "axon-code", nil, false, nil)
	model.width = 100
	model.height = 30
	model.layout()
	model.textarea.SetValue("/mo")
	model.refreshSlashMenu()

	if !model.slashOpen {
		t.Fatal("slash menu did not open")
	}
	command, ok := model.slashMenu.Selected()
	if !ok || command.Name != "model" {
		t.Fatalf("selected command = %#v", command)
	}
}

func TestSlashSelectionRunsStatus(t *testing.T) {
	model := NewModel("/tmp/axon", "axon-code", nil, false, nil)
	model.width = 100
	model.height = 30
	model.layout()
	model.textarea.SetValue("/status")
	model.refreshSlashMenu()

	updated, _ := model.runSlashSelection()
	model = updated.(Model)
	if model.slashOpen {
		t.Fatal("slash menu stayed open after running a command")
	}
	if len(model.messages) == 0 {
		t.Fatal("status command added no message")
	}
	last := model.messages[len(model.messages)-1]
	if !strings.Contains(last.Content, "Model:") ||
		!strings.Contains(last.Content, "Workspace:") {
		t.Fatalf("status message = %q", last.Content)
	}
}

func TestSlashSelectionStartsNewSession(t *testing.T) {
	model := NewModel("/tmp/axon", "axon-code", nil, false, nil)
	model.width = 100
	model.height = 30
	model.layout()
	oldID := model.sessionID
	model.textarea.SetValue("/new")
	model.refreshSlashMenu()

	updated, _ := model.runSlashSelection()
	model = updated.(Model)
	if model.sessionID == oldID {
		t.Fatal("/new did not rotate the session id")
	}
	if len(model.messages) != 0 {
		t.Fatalf("/new left messages behind: %#v", model.messages)
	}
}
