// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package ai

import "testing"

func TestModelCompatibilityBands(t *testing.T) {
	cases := []struct {
		name          string
		hostMemoryGB  int
		minMemoryGB   int
		recommendedGB int
		want          string
	}{
		{"unknown host stays visible", 0, 32, 40, ModelCompatibilityGreat},
		{"comfortable headroom", 32, 16, 24, ModelCompatibilityGreat},
		{"exactly recommended", 24, 16, 24, ModelCompatibilityGreat},
		{"between min and recommended", 20, 16, 24, ModelCompatibilityOK},
		{"exactly minimum", 16, 16, 24, ModelCompatibilityOK},
		{"below minimum", 15, 16, 24, ModelCompatibilityUnsupported},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			got := modelCompatibility(testCase.hostMemoryGB, testCase.minMemoryGB, testCase.recommendedGB)
			if got != testCase.want {
				t.Fatalf("modelCompatibility(%d, %d, %d) = %q, want %q",
					testCase.hostMemoryGB, testCase.minMemoryGB, testCase.recommendedGB, got, testCase.want)
			}
		})
	}
}

func TestModelCatalogFootprintsAreValid(t *testing.T) {
	seen := make(map[string]bool, len(modelCatalog))
	for _, model := range modelCatalog {
		if model.ID == "" || model.Label == "" || model.RuntimeName == "" {
			t.Fatalf("catalog entry is missing an id, label, or runtime name: %#v", model)
		}
		if seen[model.ID] {
			t.Fatalf("catalog id %q is duplicated", model.ID)
		}
		seen[model.ID] = true
		if model.MinMemoryGB <= 0 {
			t.Fatalf("catalog entry %q must declare a positive minimum memory", model.ID)
		}
		if model.RecommendedMemoryGB < model.MinMemoryGB {
			t.Fatalf("catalog entry %q recommends less memory than its minimum", model.ID)
		}
	}
}

func TestCatalogModelInfoCarriesFootprintAndCompatibility(t *testing.T) {
	installed := map[string]bool{modelCatalog[0].RuntimeName: true}
	models := catalogModelInfo(installed)
	if len(models) != len(modelCatalog) {
		t.Fatalf("expected %d models, got %d", len(modelCatalog), len(models))
	}
	for index, model := range models {
		entry := modelCatalog[index]
		if model.MinMemoryGB != entry.MinMemoryGB || model.RecommendedMemoryGB != entry.RecommendedMemoryGB {
			t.Fatalf("model %q lost its memory footprint", model.ID)
		}
		switch model.Compatibility {
		case ModelCompatibilityGreat, ModelCompatibilityOK, ModelCompatibilityUnsupported:
		default:
			t.Fatalf("model %q has an unknown compatibility %q", model.ID, model.Compatibility)
		}
	}
	if !models[0].Available {
		t.Fatalf("expected %q to be reported as installed", models[0].ID)
	}
	if models[1].Available {
		t.Fatalf("expected %q to be reported as not installed", models[1].ID)
	}
}
