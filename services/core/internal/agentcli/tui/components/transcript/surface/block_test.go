// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package surface

import (
	"strings"
	"testing"

	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
)

func TestTrimTrailingDropsPaddingButKeepsStyles(t *testing.T) {
	line := "\x1b[38;2;1;2;3mhello\x1b[0m \x1b[38;2;1;2;3m \x1b[0m"
	trimmed := TrimTrailing(line)

	if got := ansi.Strip(trimmed); got != "hello" {
		t.Fatalf("unexpected text %q", got)
	}
	if !strings.Contains(trimmed, "hello") {
		t.Fatalf("visible text was lost: %q", trimmed)
	}
}

func TestTrimTrailingKeepsHyperlinkCloser(t *testing.T) {
	line := "\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\   "
	trimmed := TrimTrailing(line)

	if got := ansi.Strip(trimmed); got != "link" {
		t.Fatalf("unexpected text %q", got)
	}
	if !strings.Contains(trimmed, "\x1b]8;;\x1b\\") {
		t.Fatalf("hyperlink closer was dropped: %q", trimmed)
	}
}

func TestBlockRowsAreFullWidth(t *testing.T) {
	rows := Block([]string{"hello"}, 20, lipgloss.Color("#1c2940"))
	if len(rows) != 3 {
		t.Fatalf("expected top, content, and bottom rows, got %d", len(rows))
	}
	for index, row := range rows {
		if width := lipgloss.Width(row); width != 20 {
			t.Fatalf("row %d is %d columns, want 20", index, width)
		}
	}
}
