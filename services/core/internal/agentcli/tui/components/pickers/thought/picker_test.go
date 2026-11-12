// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package thought

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"
)

func TestPickerMovesAndRenders(t *testing.T) {
	picker := New([]Option{
		{Index: 0, Preview: "first thought", Collapsed: true},
		{Index: 1, Preview: "second thought", Collapsed: false},
	}, 1)

	if picker.Selected().Index != 1 {
		t.Fatalf("selected index = %d", picker.Selected().Index)
	}
	picker.Move(1)
	if picker.Selected().Index != 0 {
		t.Fatalf("wrap selection = %d", picker.Selected().Index)
	}

	view := ansi.Strip(picker.View(80, 10))
	for _, expected := range []string{
		"Thoughts",
		"first thought",
		"second thought",
		"enter toggle",
		"a all",
	} {
		if !strings.Contains(view, expected) {
			t.Fatalf("thought picker is missing %q:\n%s", expected, view)
		}
	}
}

func TestPickerEmptyState(t *testing.T) {
	view := ansi.Strip(New(nil, 0).View(80, 10))
	if !strings.Contains(view, "No thinking blocks") {
		t.Fatalf("empty thought picker is missing its message:\n%s", view)
	}
}
