// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package transcript

import (
	"testing"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
)

func TestRendererTracksMessageOffsets(t *testing.T) {
	renderer := New()
	renderer.SetWidth(60)
	renderer.Render([]components.Message{
		{ID: "user", Role: "user", Content: "first"},
		{ID: "answer", Role: "assistant", Content: "second"},
	}, -1)

	userOffset, ok := renderer.OffsetFor("user")
	if !ok || userOffset != 0 {
		t.Fatalf("user offset = %d, %t", userOffset, ok)
	}
	answerOffset, ok := renderer.OffsetFor("answer")
	if !ok || answerOffset <= userOffset {
		t.Fatalf("answer offset = %d, %t", answerOffset, ok)
	}
}
