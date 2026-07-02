//go:build unix

package agentcli

import (
	"strings"
	"testing"
)

func TestRenderPromptInputLinesDrawsCaretWithoutHeavyGlyph(t *testing.T) {
	got := renderPromptInputLines([]rune("what model are you ?"), 6, 32, true)
	joined := strings.Join(got, "\n")
	if containsRune(joined, '▌') {
		t.Fatalf("renderPromptInputLines rendered heavy cursor glyph: %q", got)
	}
	if !strings.Contains(joined, ansiPromptCaret) {
		t.Fatalf("renderPromptInputLines did not render prompt caret: %q", got)
	}
}

func TestResolvePromptSelectionExpandsUniqueSlashCommand(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "partial model command",
			input: "/mo",
			want:  "/model",
		},
		{
			name:  "partial model command with argument",
			input: "/mo fast",
			want:  "/model fast",
		},
		{
			name:  "already complete command",
			input: "/model",
			want:  "",
		},
		{
			name:  "normal prompt",
			input: "explain this workspace",
			want:  "",
		},
		{
			name:  "unknown slash command",
			input: "/missing",
			want:  "",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := resolvePromptSelection(test.input, 0); got != test.want {
				t.Fatalf("resolvePromptSelection(%q) = %q, want %q", test.input, got, test.want)
			}
		})
	}
}

func containsRune(value string, target rune) bool {
	for _, candidate := range value {
		if candidate == target {
			return true
		}
	}
	return false
}

func TestResolvePromptSelectionUsesHighlightedSlashCommand(t *testing.T) {
	got := resolvePromptSelection("/", 1)
	if got != "/model" {
		t.Fatalf("resolvePromptSelection with highlighted /model = %q, want /model", got)
	}
}
