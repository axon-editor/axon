// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

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

func TestBuildMessagesSendsConversationAsModelTurns(t *testing.T) {
	request := ChatRequest{
		Action: "ask",
		Prompt: "What about the second file?",
		Conversation: []ConversationMessage{
			{Role: "user", Content: "Read editor/src/main/appMain.ts"},
			{Role: "assistant", Content: "The file owns Electron startup."},
		},
	}

	messages := BuildMessages(request)
	if len(messages) != 4 {
		t.Fatalf("BuildMessages returned %d messages, want system + 2 history + current", len(messages))
	}
	if messages[1].Role != "user" || !strings.Contains(messages[1].Content, "appMain.ts") {
		t.Fatalf("first history message not preserved as user turn: %#v", messages[1])
	}
	if messages[2].Role != "assistant" || !strings.Contains(messages[2].Content, "Electron startup") {
		t.Fatalf("second history message not preserved as assistant turn: %#v", messages[2])
	}
	if messages[3].Role != "user" || !strings.Contains(messages[3].Content, "What about the second file?") {
		t.Fatalf("current prompt should remain the final user turn: %#v", messages[3])
	}
}

func TestConversationHistoryStaysWithinBudget(t *testing.T) {
	conversation := make([]ConversationMessage, 0, 40)
	for index := 0; index < 40; index++ {
		conversation = append(conversation, ConversationMessage{
			Role:    "user",
			Content: strings.Repeat("x", maxConversationMessageChars),
		})
	}

	messages := priorConversationMessages(conversation)
	if len(messages) == 0 {
		t.Fatal("history should keep the most recent turns")
	}

	total := 0
	for _, message := range messages {
		total += len(message.Content)
	}
	if total > maxConversationChars {
		t.Fatalf("history chars = %d, want <= %d", total, maxConversationChars)
	}
}

func TestAgentContextDropsFileContentsAndSummarizesDiagnostics(t *testing.T) {
	request := ChatRequest{
		Action: "agent",
		Prompt: "fix the bug",
		Files: []ContextFile{
			{Path: "main.go", LanguageID: "go", Active: true, Content: "SECRET_BODY"},
		},
		Diagnostics: []Diagnostic{
			{Path: "main.go", Severity: "error", Line: 1, Column: 1, Message: "boom"},
			{Path: "util.go", Severity: "warning", Line: 2, Column: 1, Message: "meh"},
			{Path: "util.go", Severity: "info", Line: 3, Column: 1, Message: "fyi"},
		},
	}

	messages := BuildMessages(request)
	user := messages[len(messages)-1].Content

	if strings.Contains(user, "SECRET_BODY") {
		t.Fatalf("agent context should not prefill file contents\n%s", user)
	}
	if !strings.Contains(user, "Use read_file") {
		t.Fatalf("agent context should point the model at tools\n%s", user)
	}
	if !strings.Contains(user, "Diagnostics: 3 total (1 error, 1 warning, 1 info)") {
		t.Fatalf("agent context should summarize diagnostics\n%s", user)
	}
}

func TestNonAgentContextKeepsFileContents(t *testing.T) {
	request := ChatRequest{
		Action: "explain-selection",
		Prompt: "explain this",
		Files: []ContextFile{
			{Path: "main.go", LanguageID: "go", Active: true, Content: "BODY_MARKER"},
		},
	}

	user := BuildMessages(request)[len(BuildMessages(request))-1].Content
	if !strings.Contains(user, "BODY_MARKER") {
		t.Fatalf("non-agent context should keep file contents\n%s", user)
	}
}

func TestChatPayloadKeepsModelWarm(t *testing.T) {
	payload := chatPayload(ChatRequest{Action: "ask"}, nil, false)

	if payload["keep_alive"] != modelKeepAlive {
		t.Fatalf("keep_alive = %#v, want %q", payload["keep_alive"], modelKeepAlive)
	}
}

func TestChatPayloadSetsAWorkingContextWindow(t *testing.T) {
	payload := chatPayload(ChatRequest{Action: "ask"}, nil, false)
	options, ok := payload["options"].(map[string]any)
	if !ok {
		t.Fatalf("payload options missing: %#v", payload["options"])
	}

	if options["num_ctx"] != modelContextTokens {
		t.Fatalf("num_ctx = %#v, want %d", options["num_ctx"], modelContextTokens)
	}
}

func TestAgentActionTellsTheModelToUseWorkbenchTools(t *testing.T) {
	messages := BuildMessages(ChatRequest{Action: "agent", Prompt: "open the problems pane"})
	prompt := messages[0].Content + "\n" + messages[len(messages)-1].Content

	expectedFragments := []string{
		"open panels, tabs, and views",
		"open, close, or toggle a panel",
		"call the matching workbench tool instead of explaining how to do it by hand",
	}
	for _, fragment := range expectedFragments {
		if !strings.Contains(prompt, fragment) {
			t.Fatalf("agent prompt missing %q\n%s", fragment, prompt)
		}
	}
}
