// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package model

import (
	"testing"

	"github.com/GordenArcher/axon-core/internal/ai"
)

func TestGroupedRowsKeepAxonFirstAndOpenCodeAheadOfThirdParties(t *testing.T) {
	rows := groupedRows([]ai.ModelInfo{
		{ID: "anthropic/claude", Label: "Claude", ProviderLabel: "Anthropic", Backend: "opencode", ProviderID: "anthropic", Available: true},
		{ID: "axon-code", Label: "Axon Code", ProviderLabel: "Axon models", Available: true},
		{ID: "opencode/big-pickle", Label: "Big Pickle", ProviderLabel: "OpenCode", Backend: "opencode", ProviderID: "opencode", Available: true},
		{ID: "opencode-go/glm", Label: "GLM", ProviderLabel: "OpenCode Go", Backend: "opencode", ProviderID: "opencode-go", Available: true},
	})

	expected := []string{"Axon", "Axon Code", "OpenCode", "Big Pickle", "OpenCode Go", "GLM", "Anthropic", "Claude"}
	if len(rows) != len(expected) {
		t.Fatalf("row count = %d, want %d", len(rows), len(expected))
	}
	for index, label := range expected {
		if rows[index].Label != label {
			t.Fatalf("row %d = %q, want %q", index, rows[index].Label, label)
		}
	}
}

func TestGroupedRowsListAvailableModelsFirst(t *testing.T) {
	rows := groupedRows([]ai.ModelInfo{
		{ID: "opencode/zeta", Label: "Zeta", ProviderLabel: "OpenCode", Backend: "opencode", ProviderID: "opencode", Available: false},
		{ID: "opencode/alpha", Label: "Alpha", ProviderLabel: "OpenCode", Backend: "opencode", ProviderID: "opencode", Available: true},
	})

	if len(rows) != 3 || !rows[0].Header {
		t.Fatalf("unexpected rows: %#v", rows)
	}
	if rows[1].Label != "Alpha" || rows[2].Label != "Zeta" {
		t.Fatalf("availability order = %q, %q", rows[1].Label, rows[2].Label)
	}
}

func TestPickerSkipsHeadings(t *testing.T) {
	picker := New([]ai.ModelInfo{
		{ID: "axon-code", Label: "Axon Code", ProviderLabel: "Axon models", Available: true},
		{ID: "opencode/big-pickle", Label: "Big Pickle", ProviderLabel: "OpenCode", Backend: "opencode", ProviderID: "opencode", Available: true},
	}, "axon-code")

	picker.Move(1)
	if picker.SelectedID() != "opencode/big-pickle" {
		t.Fatalf("move selected %q", picker.SelectedID())
	}
	picker.Move(1)
	if picker.SelectedID() != "axon-code" {
		t.Fatalf("wrap selected %q", picker.SelectedID())
	}
}
