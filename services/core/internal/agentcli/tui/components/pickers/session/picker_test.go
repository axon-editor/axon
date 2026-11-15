// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package session

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"
)

func TestSetQueryFiltersFuzzyMatches(t *testing.T) {
	picker := New([]Option{
		{ID: "s1", Title: "Alpha conversation"},
		{ID: "s2", Title: "Opencode session", Model: "opencode/beam-free"},
	}, "")

	picker.SetQuery("opc")
	if selected := picker.SelectedID(); selected != "s2" {
		t.Fatalf("fuzzy query selected %q", selected)
	}
	view := ansi.Strip(picker.View(80, 12))
	if !strings.Contains(view, "Search  opc") {
		t.Fatalf("picker did not show the seeded query:\n%s", view)
	}
	if strings.Contains(view, "Alpha conversation") {
		t.Fatalf("picker did not filter out the non-match:\n%s", view)
	}
}

func TestSetQueryClampsSelection(t *testing.T) {
	picker := New([]Option{
		{ID: "s1", Title: "Alpha"},
		{ID: "s2", Title: "Beta"},
	}, "s1")

	picker.Move(1)
	picker.SetQuery("zzz")
	if selected := picker.SelectedID(); selected != "" {
		t.Fatalf("empty match set still selected %q", selected)
	}
}
