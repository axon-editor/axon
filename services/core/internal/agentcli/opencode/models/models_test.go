// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package models

import (
	"strings"
	"testing"

	"github.com/GordenArcher/axon-core/internal/agentcli/opencode/client"
)

func TestMapModelsFiltersAndNamesProviders(t *testing.T) {
	disabled := false
	bigPickle := client.Model{ID: "big-pickle", ProviderID: "opencode", Name: "Big Pickle"}
	bigPickle.Capabilities.Tools = true
	models := []client.Model{
		bigPickle,
		{ID: "retired", ProviderID: "opencode", Status: "deprecated"},
		{ID: "embed", ProviderID: "opencode", Type: "embedding"},
		{ID: "hidden", ProviderID: "opencode", Enabled: &disabled},
	}
	providers := []client.Provider{{ID: "opencode", Name: "OpenCode"}}

	mapped := mapModels(models, providers)
	if len(mapped) != 1 {
		t.Fatalf("mapped count = %d", len(mapped))
	}
	model := mapped[0]
	if model.ID != "opencode/big-pickle" || model.ProviderLabel != "OpenCode" {
		t.Fatalf("mapped model = %#v", model)
	}
	if model.Backend != "opencode" || model.ProviderID != "opencode" || model.ModelID != "big-pickle" {
		t.Fatalf("routing fields = %#v", model)
	}
	if !strings.Contains(model.Description, "tools") {
		t.Fatalf("description = %q", model.Description)
	}
	if !model.Available {
		t.Fatal("OpenCode models should be selectable before an account check")
	}
}

func TestMapModelsMarksPaidOpenCodeGoModels(t *testing.T) {
	mapped := mapModels(
		[]client.Model{
			{ID: "glm-5", ProviderID: "opencode-go", Name: "GLM 5"},
			{ID: "longcat-free", ProviderID: "opencode-go", Name: "LongCat Free"},
		},
		[]client.Provider{{ID: "opencode-go", Name: "OpenCode Go"}},
	)

	if !strings.Contains(mapped[0].Description, "account") {
		t.Fatalf("paid model description = %q", mapped[0].Description)
	}
	if strings.Contains(mapped[1].Description, "account") {
		t.Fatalf("free model description = %q", mapped[1].Description)
	}
}
