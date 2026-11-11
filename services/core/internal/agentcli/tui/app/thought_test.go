// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"testing"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
)

func TestThoughtPickerTogglesOneBlock(t *testing.T) {
	model := Model{messages: []components.Message{
		{Thinking: true, Collapsed: true, Content: "first thought"},
		{Thinking: true, Collapsed: true, Content: "second thought"},
		{Content: "answer"},
	}}
	model.openThoughtPicker()
	if !model.thoughtOpen {
		t.Fatal("thought picker did not open")
	}
	if selected := model.thoughtPicker.Selected().Index; selected != 1 {
		t.Fatalf("initial selection = %d, want the newest thought", selected)
	}

	updated, _ := model.updateThoughtPicker(keyMsg("enter"))
	model = updated.(Model)
	if !model.messages[0].Collapsed {
		t.Fatal("toggling the newest thought changed the older one")
	}
	if model.messages[1].Collapsed {
		t.Fatal("selected thought did not expand")
	}
	if model.thoughtOpen {
		t.Fatal("picker stayed open after Enter; the full thought must be visible")
	}

	model.openThoughtPicker()
	updated, _ = model.updateThoughtPicker(keyMsg("a"))
	model = updated.(Model)
	if !model.messages[0].Collapsed || !model.messages[1].Collapsed {
		t.Fatalf("toggle-all did not collapse both: %#v", model.messages)
	}
	if model.thoughtOpen {
		t.Fatal("picker stayed open after toggle-all")
	}
}

func TestThoughtPickerWithoutThoughts(t *testing.T) {
	model := Model{messages: []components.Message{{Content: "answer"}}}
	model.openThoughtPicker()
	if model.thoughtOpen {
		t.Fatal("picker opened with no thoughts")
	}
	if model.status != "No thoughts in this conversation" {
		t.Fatalf("status = %q", model.status)
	}
}
