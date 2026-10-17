// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package ai

import (
	"fmt"
	"strings"
)

// This file turns an editor request into the exact message list and context a
// local model sees. Prompt shaping, role instructions, and the context builders
// change constantly, so keeping them apart from the runtime and streaming
// transport in ai.go keeps both files small enough to reason about.

func BuildMessages(request ChatRequest) []ModelMessage {
	messages := []ModelMessage{
		{
			Role: "system",
			Content: strings.Join([]string{
				"You are Axon Agent, the local coding assistant inside Axon Editor.",
				"You are project-aware, direct, and precise.",
				"Do not claim to use cloud services.",
				"Do not invent marketing copy, README content, support emails, docs links, files, or product claims.",
				"Never invent placeholder paths, counts, filenames, symbols, commands, URLs, emails, API names, or project facts. Use exact values from context and tool results. If a value is missing, say it is not available.",
				"Never present example values such as /path/to/your/project, 123 indexed files, example.com, or support@example.com as real workspace facts.",
				"Use the available project tools before answering when the user asks about files, project structure, symbols, implementation details, or text that may not be in the prompt.",
				"Never guess which file contains a symbol or feature. Search or read the project first, then answer from the tool results.",
				"If Project context is present, you can see the workspace snapshot included in this request. Do not say you cannot inspect the project, cannot see the codebase, or need the user to provide files.",
				"If the user asks whether you can see the codebase, answer directly: yes when Project context is present, then mention the workspace root and the indexed file/tree counts.",
				projectFactInstruction(request),
				plainTextOnlyInstruction(request.Action),
				editProposalInstruction(request.Action),
			}, "\n"),
		},
	}

	messages = append(messages, priorConversationMessages(request.Conversation)...)
	messages = append(messages, ModelMessage{
		Role: "user",
		Content: strings.Join([]string{
			"Action: " + request.Action,
			"Instruction: " + actionInstruction(request.Action),
			"User prompt: " + fallback(request.Prompt, "(no extra prompt)"),
			"Context:",
			buildContext(request),
		}, "\n\n"),
	})
	return messages
}

func priorConversationMessages(conversation []ConversationMessage) []ModelMessage {
	if len(conversation) == 0 {
		return nil
	}

	// Conversation history must be real model turns, not a flattened paragraph
	// inside the latest prompt. Local models use role boundaries to understand
	// follow-up questions, so resumed CLI sessions keep the last turns while the
	// current user prompt is always appended separately by BuildMessages.
	start := len(conversation) - 20
	if start < 0 {
		start = 0
	}

	messages := make([]ModelMessage, 0, len(conversation)-start)
	for _, message := range conversation[start:] {
		role := normalizedConversationRole(message.Role)
		content := strings.TrimSpace(message.Content)
		if content == "" {
			continue
		}
		messages = append(messages, ModelMessage{
			Role:    role,
			Content: trimForPrompt(content, 4000),
		})
	}
	return messages
}

func normalizedConversationRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "assistant", "tool":
		return strings.ToLower(strings.TrimSpace(role))
	default:
		return "user"
	}
}

func projectFactInstruction(request ChatRequest) string {
	if request.ProjectContext == nil {
		return "No Project context is attached to this request. Do not claim to see workspace files unless a tool result provides them."
	}

	contextPack := request.ProjectContext
	// The model is allowed to speak confidently only about facts that the core
	// has attached to this request. Local coding models often fill missing
	// facts with tutorial-style placeholders, so the exact workspace facts are
	// repeated in the system message where they override generic examples.
	return fmt.Sprintf(
		"Current project facts: Project context is attached. Workspace root is %s. Indexed files are %d included, %d total, %d skipped, truncated=%t. Use these exact values when asked what workspace you can see.",
		contextPack.Root,
		contextPack.IncludedFiles,
		contextPack.TotalFiles,
		contextPack.SkippedFiles,
		contextPack.Truncated,
	)
}

func plainTextOnlyInstruction(action string) string {
	// The autonomous agent decides for itself whether a plain answer, a tool
	// call, or an edit proposal is the right response. Every other action keeps
	// the original read-only default so Ask/chat and review actions never write
	// files by surprise.
	if action == "agent" {
		return "Decide for yourself whether a plain answer, a tool call, or an edit proposal best serves the user. Use the available tools to gather any context you need before you act."
	}
	return "For normal Ask/chat prompts, answer in plain text only. Do not propose file edits. Do not output JSON."
}

func editProposalInstruction(action string) string {
	switch action {
	case "agent", "fix-problem", "refactor-selection", "generate-tests":
		return "For this action, include an editProposal JSON block only when a concrete file edit is necessary. The JSON must be exactly shaped as {\"editProposal\":{\"title\":\"...\",\"files\":[{\"path\":\"absolute or workspace path\",\"summary\":\"...\",\"newContent\":\"full file content\"}]}}. Explain the change in normal text before or after the JSON."
	default:
		return "For this action, never include editProposal JSON and never create or rewrite files."
	}
}

func actionInstruction(action string) string {
	switch action {
	case "agent":
		return "Act as an autonomous coding agent. Gather any context you need with the available tools (list_problems, read_file, search_project, list_files) and then decide what to do on your own. When a change to a file is needed, return an edit proposal."
	case "explain-selection":
		return "Explain the active code clearly. Focus on behavior, data flow, edge cases, and why the code exists."
	case "fix-problem":
		return "First call list_problems to see every problem in the workspace, then fix the most relevant one. Prefer a precise edit proposal when a file change is needed."
	case "refactor-selection":
		return "Refactor the active code without changing behavior. Prefer readable, maintainable code."
	case "generate-tests":
		return "Generate meaningful tests for the active code. Prefer a concrete edit proposal for test files."
	case "review-git-diff":
		return "Review the current Git diff. Prioritize bugs, regressions, missing tests, and risky behavior."
	case "draft-commit-message":
		return "Draft a production-quality commit message with a concise summary and detailed bullets."
	default:
		return "Answer the user's question using the supplied project context."
	}
}

func buildContext(request ChatRequest) string {
	// The autonomous agent is expected to pull project detail with tools, so its
	// context stays intentionally small: paths, a diagnostics summary, and the
	// on-screen workbench state. Full file contents, the diagnostics list, and the
	// git diff are the largest prompt blocks, and every one of them is reachable
	// through read_file, search_project, list_problems, and the workspace tools.
	if request.Action == "agent" {
		return buildAgentContext(request)
	}

	parts := []string{
		"Workspace: " + pointerString(request.FolderPath, "No workspace"),
		"Active file: " + pointerString(request.ActiveFilePath, "No active file"),
	}

	if len(request.Diagnostics) > 0 {
		lines := []string{"Diagnostics:"}
		for index, diagnostic := range request.Diagnostics {
			if index >= 25 {
				break
			}
			lines = append(lines, fmt.Sprintf("- %s:%d:%d [%s] %s", diagnostic.Path, diagnostic.Line, diagnostic.Column, diagnostic.Severity, diagnostic.Message))
		}
		parts = append(parts, strings.Join(lines, "\n"))
	}

	if len(request.GitChanges) > 0 {
		lines := []string{"Git changes:"}
		for index, change := range request.GitChanges {
			if index >= 50 {
				break
			}
			lines = append(lines, fmt.Sprintf("- %s staged=%t unstaged=%t index=%s worktree=%s", change.Path, change.Staged, change.Unstaged, change.IndexState, change.WorktreeState))
		}
		parts = append(parts, strings.Join(lines, "\n"))
	}

	if strings.TrimSpace(request.GitDiff) != "" {
		parts = append(parts, "Git diff:\n"+trimForPrompt(request.GitDiff, 16000))
	}

	if request.UIState != nil {
		parts = append(parts, formatUIStateForPrompt(*request.UIState))
	}

	if request.ProjectContext != nil {
		parts = append(parts, formatProjectContextForPrompt(*request.ProjectContext))
	}

	for index, file := range request.Files {
		if index >= 6 {
			break
		}
		limit := 8000
		if file.Active {
			limit = 24000
		}
		active := ""
		if file.Active {
			active = " [active]"
		}
		parts = append(parts, fmt.Sprintf("File: %s (%s)%s\n%s", file.Path, file.LanguageID, active, trimForPrompt(file.Content, limit)))
	}

	return strings.Join(parts, "\n\n---\n\n")
}

// buildAgentContext keeps the autonomous agent's prompt small. It carries the
// facts the agent cannot discover with tools (where it is, what is on screen,
// whether the workspace has problems) and points at the tools for everything
// else, so the model reads files and diagnostics on demand instead of prefilling
// the whole project on every turn.
func buildAgentContext(request ChatRequest) string {
	parts := []string{
		"Workspace: " + pointerString(request.FolderPath, "No workspace"),
		"Active file: " + pointerString(request.ActiveFilePath, "No active file"),
	}

	if len(request.Diagnostics) > 0 {
		parts = append(parts, diagnosticsSummary(request.Diagnostics))
	}

	if len(request.GitChanges) > 0 {
		lines := []string{"Git changes:"}
		for index, change := range request.GitChanges {
			if index >= 50 {
				break
			}
			lines = append(lines, fmt.Sprintf("- %s staged=%t unstaged=%t index=%s worktree=%s", change.Path, change.Staged, change.Unstaged, change.IndexState, change.WorktreeState))
		}
		parts = append(parts, strings.Join(lines, "\n"))
	}

	if request.UIState != nil {
		parts = append(parts, formatUIStateForPrompt(*request.UIState))
	}

	if request.ProjectContext != nil {
		parts = append(parts, formatProjectContextForPrompt(*request.ProjectContext))
	}

	parts = append(parts, "File contents are not attached. Use read_file, search_project, list_files, and list_problems to inspect the project before you answer.")

	return strings.Join(parts, "\n\n---\n\n")
}

func diagnosticsSummary(diagnostics []Diagnostic) string {
	counts := map[string]int{}
	for _, diagnostic := range diagnostics {
		counts[strings.ToLower(strings.TrimSpace(diagnostic.Severity))]++
	}
	return fmt.Sprintf(
		"Diagnostics: %d total (%d error, %d warning, %d info). Use list_problems for the full list.",
		len(diagnostics),
		counts["error"],
		counts["warning"],
		counts["info"],
	)
}

func formatUIStateForPrompt(state UIState) string {
	lines := []string{
		"Workbench (what the user can currently see):",
		fmt.Sprintf("Explorer sidebar collapsed: %t", state.SidebarCollapsed),
		fmt.Sprintf("Axon Agent panel open: %t", state.AgentSidebarOpen),
		fmt.Sprintf("Terminal open: %t", state.TerminalOpen),
		fmt.Sprintf("Bottom panel open: %t (tab: %s)", state.BottomPanelOpen, pointerString(state.BottomPanelTab, "none")),
		fmt.Sprintf("Zen mode: %t", state.ZenMode),
		"Active file: " + pointerString(state.ActiveFilePath, "No active file"),
	}
	if len(state.OpenFilePaths) > 0 {
		lines = append(lines, "Open editor tabs:")
		for index, path := range state.OpenFilePaths {
			if index >= 40 {
				break
			}
			lines = append(lines, "- "+path)
		}
	}
	return strings.Join(lines, "\n")
}

func formatProjectContextForPrompt(contextPack ProjectContext) string {
	lines := []string{
		"Project context:",
		"Project visibility: attached to this request.",
		fmt.Sprintf("Root: %s", contextPack.Root),
		fmt.Sprintf("Files indexed: %d included, %d total, %d skipped, truncated=%t", contextPack.IncludedFiles, contextPack.TotalFiles, contextPack.SkippedFiles, contextPack.Truncated),
	}
	if len(contextPack.Tree) > 0 {
		lines = append(lines, "Workspace tree:")
		for index, entry := range contextPack.Tree {
			if index >= 350 {
				lines = append(lines, fmt.Sprintf("[tree truncated, %d more entries]", len(contextPack.Tree)-index))
				break
			}
			lines = append(lines, "- "+entry)
		}
	}
	for _, file := range contextPack.Files {
		truncated := ""
		if file.Truncated {
			truncated = " [truncated]"
		}
		lines = append(lines, fmt.Sprintf("Project file: %s (%s, %d bytes)%s\n%s", file.Path, file.LanguageID, file.Size, truncated, trimForPrompt(file.Content, maxProjectContextFileBytes)))
	}
	return strings.Join(lines, "\n")
}

func trimForPrompt(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit] + fmt.Sprintf("\n\n[truncated %d chars]", len(value)-limit)
}

func temperatureForAction(action string) float64 {
	if action == "draft-commit-message" {
		return 0.2
	}
	return 0.35
}

func fallback(value string, fallbackValue string) string {
	if strings.TrimSpace(value) == "" {
		return fallbackValue
	}
	return value
}

func pointerString(value *string, fallbackValue string) string {
	if value == nil || strings.TrimSpace(*value) == "" {
		return fallbackValue
	}
	return *value
}
