package agentcli

import (
	"strings"
	"testing"

	"github.com/GordenArcher/axon-core/internal/ai"
)

func TestStreamStatusLabelHidesInternalBackendStatuses(t *testing.T) {
	tests := map[string]string{
		"Checking local model runtime...": "Preparing local model",
		"Streaming response...":           "Preparing response",
		"Reading project context...":      "Reading workspace",
	}

	for input, want := range tests {
		if got := streamStatusLabel(input); got != want {
			t.Fatalf("streamStatusLabel(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestShimmerStatusTextKeepsLabelAndAddsHighlight(t *testing.T) {
	got := shimmerStatusText("Axon is thinking", 40, 2)
	plain := stripAnsiForTest(got)

	if plain != "Axon is thinking" {
		t.Fatalf("shimmerStatusText plain text = %q, want %q", plain, "Axon is thinking")
	}
	if !strings.Contains(got, ansiWhite) {
		t.Fatalf("shimmerStatusText should include the white highlight escape sequence")
	}
}

func TestShouldFetchProjectContextUsesRecentConversation(t *testing.T) {
	input := streamRequestInput{
		Action: "ask",
		Prompt: "Can you see, yes or no?",
		Conversation: []ai.ConversationMessage{
			{Role: "user", Content: "Can you see my code base?"},
			{Role: "assistant", Content: "I need more context."},
		},
	}

	if !shouldFetchProjectContext(input) {
		t.Fatal("expected project context for a short follow-up after a codebase question")
	}
}

func TestPromptNeedsProjectContextForCodebaseQuestions(t *testing.T) {
	if !promptNeedsProjectContext("can you see my codebase?") {
		t.Fatal("expected codebase prompt to request project context")
	}
	if promptNeedsProjectContext("hello") {
		t.Fatal("did not expect a greeting to request project context")
	}
}

func stripAnsiForTest(value string) string {
	replacer := strings.NewReplacer(
		ansiReset, "",
		ansiDim, "",
		ansiGreen, "",
		ansiRed, "",
		ansiWhite, "",
		ansiAccent, "",
		ansiMuted, "",
		ansiInputBg, "",
		ansiActiveRow, "",
	)
	return replacer.Replace(value)
}
