// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"strings"
	"testing"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/pickers"
)

func TestSessionPickerHidesComposer(t *testing.T) {
	model := NewModel("/tmp/axon", "axon-code", nil, false, nil)
	model.width = 80
	model.height = 24
	model.layout()
	model.sessionPicker = pickers.NewSessionPicker([]pickers.SessionOption{
		{ID: "s1", Title: "Saved conversation"},
	}, "")
	model.sessionPickerOpen = true

	view := model.View()
	for _, forbidden := range []string{"Ask Axon...", "╭", "╰", "enter send"} {
		if strings.Contains(view, forbidden) {
			t.Fatalf("session picker still renders the composer %q:\n%s", forbidden, view)
		}
	}
	if !strings.Contains(view, "Saved conversation") {
		t.Fatalf("session picker is missing its list:\n%s", view)
	}
}
