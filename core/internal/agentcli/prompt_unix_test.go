//go:build unix

package agentcli

import "testing"

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

func TestResolvePromptSelectionUsesHighlightedSlashCommand(t *testing.T) {
	got := resolvePromptSelection("/", 1)
	if got != "/model" {
		t.Fatalf("resolvePromptSelection with highlighted /model = %q, want /model", got)
	}
}
