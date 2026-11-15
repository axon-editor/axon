// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package slash

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"
)

func TestMenuFiltersAndSelects(t *testing.T) {
	menu := New([]Command{
		{Name: "model", Description: "Choose the active model"},
		{Name: "new", Description: "Start a new conversation"},
		{Name: "status", Description: "Show session details"},
	}, "mo")

	if menu.Len() != 1 {
		t.Fatalf("filtered commands = %d", menu.Len())
	}
	command, ok := menu.Selected()
	if !ok || command.Name != "model" {
		t.Fatalf("selected command = %#v", command)
	}
	view := ansi.Strip(menu.View(80))
	for _, expected := range []string{"Commands", "/model", "Choose the active model", "enter run"} {
		if !strings.Contains(view, expected) {
			t.Fatalf("slash menu is missing %q:\n%s", expected, view)
		}
	}
}

func TestMenuMovesAndWraps(t *testing.T) {
	menu := New([]Command{{Name: "a"}, {Name: "b"}}, "")
	menu.Move(-1)
	command, _ := menu.Selected()
	if command.Name != "b" {
		t.Fatalf("wrapped selection = %q", command.Name)
	}
	if menu.Height() != 4 {
		t.Fatalf("menu height = %d", menu.Height())
	}
}

func TestMenuFuzzyMatchesAbbreviations(t *testing.T) {
	commands := []Command{
		{Name: "resume", Description: "Resume a saved conversation"},
		{Name: "model", Description: "Choose the active model"},
		{Name: "status", Description: "Show session details"},
	}

	for query, expected := range map[string]string{
		"rsm": "resume",
		"mdl": "model",
		"sts": "status",
	} {
		menu := New(commands, query)
		command, ok := menu.Selected()
		if !ok || command.Name != expected {
			t.Fatalf("query %q selected %#v", query, command)
		}
	}
}
