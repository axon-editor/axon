package agentcli

import (
	"testing"

	"github.com/GordenArcher/axon-core/internal/ai"
)

func TestResolveSlashCommandNameAcceptsUniquePrefixes(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		wantName  string
		wantFound bool
	}{
		{
			name:      "partial model command",
			input:     "mo",
			wantName:  "model",
			wantFound: true,
		},
		{
			name:      "models alias",
			input:     "models",
			wantName:  "model",
			wantFound: true,
		},
		{
			name:      "help command",
			input:     "help",
			wantName:  "help",
			wantFound: true,
		},
		{
			name:      "unknown command",
			input:     "missing",
			wantName:  "",
			wantFound: false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			gotName, gotFound := resolveSlashCommandName(test.input)
			if gotName != test.wantName || gotFound != test.wantFound {
				t.Fatalf("resolveSlashCommandName(%q) = (%q, %v), want (%q, %v)", test.input, gotName, gotFound, test.wantName, test.wantFound)
			}
		})
	}
}

func TestInstalledModelsKeepsOnlyAvailableModels(t *testing.T) {
	models := []ai.ModelInfo{
		{ID: "axon-code", Label: "Axon Code", Available: true},
		{ID: "axon-reason", Label: "Axon Reason", Available: false},
		{ID: "axon-compact", Label: "Axon Compact", Available: true},
	}

	got := installedModels(models)
	if len(got) != 2 {
		t.Fatalf("installedModels returned %d models, want 2", len(got))
	}
	if got[0].ID != "axon-code" || got[1].ID != "axon-compact" {
		t.Fatalf("installedModels returned %v, want only available models in original order", got)
	}
}

func TestFilterSlashCommandsUsesFirstTokenAndRanksAliases(t *testing.T) {
	matches := filterSlashCommands("/models extra text")
	if len(matches) == 0 || matches[0].Name != "model" {
		t.Fatalf("filterSlashCommands did not promote /models alias: %#v", matches)
	}
}

func TestFilterSlashCommandsSupportsFuzzyCommandTyping(t *testing.T) {
	matches := filterSlashCommands("/mdl")
	if len(matches) == 0 || matches[0].Name != "model" {
		t.Fatalf("filterSlashCommands did not fuzzy-match /mdl to /model: %#v", matches)
	}
}
