// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package markdown

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"
)

func TestRenderStripsTerminalControls(t *testing.T) {
	rendered := New(80).Render("safe \x1b[31mred\x1b[0m \x1b]0;title\x07end")
	stripped := ansi.Strip(rendered)

	if !strings.Contains(stripped, "safe red end") {
		t.Fatalf("visible text changed: %q", stripped)
	}
	if strings.Contains(stripped, "title") {
		t.Fatalf("OSC payload leaked into the transcript: %q", stripped)
	}
}

func TestRenderRemovesMarkdownSyntax(t *testing.T) {
	rendered := ansi.Strip(New(80).Render(
		"## Heading\n\n**bold text**\n\n- first\n- second\n\n`inline`\n",
	))
	for _, syntax := range []string{"##", "**", "`"} {
		if strings.Contains(rendered, syntax) {
			t.Fatalf("rendered markdown still contains %q:\n%s", syntax, rendered)
		}
	}
	for _, expected := range []string{"Heading", "bold text", "first", "second", "inline"} {
		if !strings.Contains(rendered, expected) {
			t.Fatalf("rendered markdown is missing %q:\n%s", expected, rendered)
		}
	}
}

func TestRenderHandlesPartialFence(t *testing.T) {
	rendered := ansi.Strip(New(80).Render("```go\nfmt.Pr"))
	if !strings.Contains(rendered, "fmt.Pr") {
		t.Fatalf("partial code fence was dropped: %q", rendered)
	}
}
