package ai

import (
	"strings"
	"testing"
)

func TestBuildMessagesIncludesExactProjectFacts(t *testing.T) {
	request := ChatRequest{
		Action: "ask",
		Prompt: "Can you see my workspace?",
		ProjectContext: &ProjectContext{
			Root:          "/Users/gorden/projects/axon-agent",
			TotalFiles:    19,
			IncludedFiles: 7,
			SkippedFiles:  3,
			Truncated:     true,
		},
	}

	messages := BuildMessages(request)
	if len(messages) == 0 {
		t.Fatal("BuildMessages returned no messages")
	}

	systemPrompt := messages[0].Content
	expectedFragments := []string{
		"Never invent placeholder paths",
		"Never present example values such as /path/to/your/project",
		"Workspace root is /Users/gorden/projects/axon-agent",
		"Indexed files are 7 included, 19 total, 3 skipped, truncated=true",
	}
	for _, fragment := range expectedFragments {
		if !strings.Contains(systemPrompt, fragment) {
			t.Fatalf("system prompt missing %q\n%s", fragment, systemPrompt)
		}
	}
}

func TestBuildMessagesRejectsWorkspaceClaimsWithoutProjectContext(t *testing.T) {
	request := ChatRequest{
		Action: "ask",
		Prompt: "Can you see my workspace?",
	}

	systemPrompt := BuildMessages(request)[0].Content
	if !strings.Contains(systemPrompt, "No Project context is attached") {
		t.Fatalf("system prompt should guard workspace visibility without context\n%s", systemPrompt)
	}
}
