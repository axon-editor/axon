package agentcli

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/GordenArcher/axon-core/internal/ai"
)

func TestBuildCliToolContextListsWorkspaceForVisibilityQuestion(t *testing.T) {
	workspace := t.TempDir()
	if err := os.WriteFile(filepath.Join(workspace, "main.go"), []byte("package main\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	contextText := buildCliToolContext(context.Background(), streamRequestInput{
		Action:     "ask",
		Prompt:     "can you see my workspace?",
		FolderPath: workspace,
	})

	if !strings.Contains(contextText, "Axon deterministic project context") {
		t.Fatalf("expected deterministic context header, got %q", contextText)
	}
	if !strings.Contains(contextText, "main.go") {
		t.Fatalf("expected file list to include main.go, got %q", contextText)
	}
}

func TestBuildCliToolContextUsesRecentConversationForShortFollowUp(t *testing.T) {
	workspace := t.TempDir()
	if err := os.WriteFile(filepath.Join(workspace, "agent.go"), []byte("package agent\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	contextText := buildCliToolContext(context.Background(), streamRequestInput{
		Action:     "ask",
		Prompt:     "yes",
		FolderPath: workspace,
		Conversation: []ai.ConversationMessage{
			{Role: "user", Content: "what do you see in this codebase?"},
			{Role: "assistant", Content: "The workspace is available."},
		},
	})

	if !strings.Contains(contextText, "agent.go") {
		t.Fatalf("expected follow-up context to inherit project intent, got %q", contextText)
	}
}
