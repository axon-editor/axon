// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package composer

import "testing"

func TestSlashMenuFiltersCommands(t *testing.T) {
	state := New()
	if changed := state.SetValue("/mo"); !changed {
		t.Fatal("opening the slash menu did not report a layout change")
	}
	if !state.Open {
		t.Fatal("slash menu did not open")
	}
	command, ok := state.SelectedCommand()
	if !ok || command.Name != "model" {
		t.Fatalf("selected command = %#v", command)
	}
}

func TestSlashMenuClosesForArguments(t *testing.T) {
	state := New()
	state.SetValue("/model")
	if !state.Open {
		t.Fatal("slash menu did not open for a bare command")
	}
	state.SetValue("/model sonnet")
	if state.Open {
		t.Fatal("slash menu stayed open once arguments were typed")
	}
}

func TestSlashMenuClosesForUnknownCommand(t *testing.T) {
	state := New()
	state.SetValue("/zzz")
	if state.Open {
		t.Fatal("slash menu opened with no matching command")
	}
}

func TestSlashMenuMovesBetweenCommands(t *testing.T) {
	state := New()
	state.SetValue("/")
	first, ok := state.SelectedCommand()
	if !ok {
		t.Fatal("slash menu had no first command")
	}
	state.MoveMenu(1)
	second, ok := state.SelectedCommand()
	if !ok || second.Name == first.Name {
		t.Fatalf("moving did not change the command: %#v", second)
	}
}
