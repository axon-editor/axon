// Package ai owns Axon's local model bridge.
//
// The desktop shell and renderer should not know whether Axon models are backed
// by an Ollama-compatible runtime today or another local runtime tomorrow. This
// package keeps that boundary in axon-core: callers send editor intent and
// project context, and core turns it into a streaming model request.
package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type Diagnostic struct {
	Path     string `json:"path"`
	Message  string `json:"message"`
	Line     int    `json:"line"`
	Column   int    `json:"column"`
	Severity string `json:"severity"`
	Source   any    `json:"source"`
}

type GitChange struct {
	Path          string `json:"path"`
	IndexState    string `json:"indexState"`
	WorktreeState string `json:"worktreeState"`
	Staged        bool   `json:"staged"`
	Unstaged      bool   `json:"unstaged"`
}

type ContextFile struct {
	Path       string `json:"path"`
	Content    string `json:"content"`
	LanguageID string `json:"languageId"`
	Active     bool   `json:"active"`
}

type ConversationMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	Action         string                `json:"action"`
	Prompt         string                `json:"prompt"`
	FolderPath     *string               `json:"folderPath"`
	ActiveFilePath *string               `json:"activeFilePath"`
	Files          []ContextFile         `json:"files"`
	Diagnostics    []Diagnostic          `json:"diagnostics"`
	GitChanges     []GitChange           `json:"gitChanges"`
	Conversation   []ConversationMessage `json:"conversation"`
	ProjectContext *ProjectContext       `json:"projectContext"`
	GitDiff        string                `json:"gitDiff"`
	Model          string                `json:"model"`
}

type StreamEvent struct {
	Type   string `json:"type"`
	Delta  string `json:"delta,omitempty"`
	Status string `json:"status,omitempty"`
	Error  string `json:"error,omitempty"`
	Done   bool   `json:"done,omitempty"`
}

type ErrorDetail struct {
	Field   string `json:"field,omitempty"`
	Code    string `json:"code,omitempty"`
	Message string `json:"message"`
}

type UserError struct {
	Field   string
	Code    string
	Message string
}

func (err UserError) Error() string {
	return err.Message
}

type ModelInfo struct {
	ID            string `json:"id"`
	Label         string `json:"label"`
	Description   string `json:"description,omitempty"`
	ProviderLabel string `json:"providerLabel"`
	Available     bool   `json:"available"`
}

type catalogModel struct {
	ID          string
	Label       string
	Description string
	RuntimeName string
}

var modelCatalog = []catalogModel{
	{
		ID:          "axon-code",
		Label:       "Axon Code",
		Description: "Balanced local coding model for everyday editing, fixes, and explanations.",
		RuntimeName: "qwen2.5-coder:7b",
	},
	{
		ID:          "axon-code-fast",
		Label:       "Axon Code Fast",
		Description: "Lower-latency coding model for quick questions and small edits.",
		RuntimeName: "qwen2.5-coder:3b",
	},
	{
		ID:          "axon-reason",
		Label:       "Axon Reason",
		Description: "Reasoning-focused local model for harder debugging and planning.",
		RuntimeName: "deepseek-r1:8b",
	},
	{
		ID:          "axon-general",
		Label:       "Axon General",
		Description: "General local assistant for project questions and writing tasks.",
		RuntimeName: "llama3.1:8b",
	},
	{
		ID:          "axon-compact",
		Label:       "Axon Compact",
		Description: "Small local model for machines with tighter memory limits.",
		RuntimeName: "phi3:mini",
	},
}

type modelMessage struct {
	Role      string          `json:"role"`
	Content   string          `json:"content"`
	ToolCalls []modelToolCall `json:"tool_calls,omitempty"`
}

type modelToolCall struct {
	Function modelToolFunction `json:"function"`
}

type modelToolFunction struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

type localModelListResponse struct {
	Models []struct {
		Name string `json:"name"`
	} `json:"models"`
}

type modelStreamResponse struct {
	Message *struct {
		Content   string          `json:"content"`
		ToolCalls []modelToolCall `json:"tool_calls"`
	} `json:"message"`
	Response string `json:"response"`
	Error    string `json:"error"`
	Done     bool   `json:"done"`
}

type modelChatResponse struct {
	Message modelMessage `json:"message"`
	Error   string       `json:"error"`
}

func ModelBaseURL() string {
	baseURL := strings.TrimSpace(os.Getenv("AXON_MODELS_URL"))
	if baseURL == "" {
		baseURL = "http://127.0.0.1:11434"
	}
	return strings.TrimRight(baseURL, "/")
}

func ModelName(request ChatRequest) string {
	if strings.TrimSpace(os.Getenv("AXON_MODELS_MODEL")) != "" {
		return strings.TrimSpace(os.Getenv("AXON_MODELS_MODEL"))
	}
	if strings.TrimSpace(request.Model) != "" {
		return RuntimeModelName(strings.TrimSpace(request.Model))
	}
	return RuntimeModelName("axon-code")
}

func RuntimeModelName(modelID string) string {
	trimmedModelID := strings.TrimSpace(modelID)
	for _, model := range modelCatalog {
		if model.ID == trimmedModelID {
			return model.RuntimeName
		}
	}
	return trimmedModelID
}

func DefaultModelID() string {
	return modelCatalog[0].ID
}

func CatalogModel(modelID string) catalogModel {
	trimmedModelID := strings.TrimSpace(modelID)
	for _, model := range modelCatalog {
		if model.ID == trimmedModelID {
			return model
		}
	}
	return catalogModel{
		ID:          trimmedModelID,
		Label:       "Selected Axon model",
		Description: "",
		RuntimeName: trimmedModelID,
	}
}

func PublicError(err error) ErrorDetail {
	var userError UserError
	if errors.As(err, &userError) {
		return ErrorDetail{
			Field:   userError.Field,
			Code:    strings.ToUpper(userError.Code),
			Message: userError.Message,
		}
	}

	return ErrorDetail{
		Code:    "AI_RUNTIME_ERROR",
		Message: sanitizeRuntimeModelNames(err.Error()),
	}
}

func sanitizeRuntimeModelNames(message string) string {
	safeMessage := message
	for _, model := range modelCatalog {
		safeMessage = strings.ReplaceAll(safeMessage, model.RuntimeName, model.Label)
	}
	return safeMessage
}

func ListModels(ctx context.Context, selectedModel string) ([]ModelInfo, error) {
	modelName := strings.TrimSpace(selectedModel)
	if modelName == "" {
		modelName = DefaultModelID()
	}

	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodGet, ModelBaseURL()+"/api/tags", nil)
	if err != nil {
		return nil, err
	}

	response, err := http.DefaultClient.Do(httpRequest)
	if err != nil {
		return catalogModelInfo(nil), nil
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return catalogModelInfo(nil), nil
	}

	var listResponse localModelListResponse
	if err := json.NewDecoder(response.Body).Decode(&listResponse); err != nil {
		return nil, err
	}
	installedRuntimeModels := make(map[string]bool, len(listResponse.Models))
	for _, model := range listResponse.Models {
		installedRuntimeModels[strings.TrimSpace(model.Name)] = true
	}
	return catalogModelInfo(installedRuntimeModels), nil
}

func catalogModelInfo(installedRuntimeModels map[string]bool) []ModelInfo {
	models := make([]ModelInfo, 0, len(modelCatalog))
	for _, model := range modelCatalog {
		models = append(models, ModelInfo{
			ID:            model.ID,
			Label:         model.Label,
			Description:   model.Description,
			ProviderLabel: "Axon models",
			Available:     installedRuntimeModels != nil && installedRuntimeModels[model.RuntimeName],
		})
	}
	return models
}

func BuildMessages(request ChatRequest) []modelMessage {
	messages := []modelMessage{
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
				"For normal Ask/chat prompts, answer in plain text only. Do not propose file edits. Do not output JSON.",
				editProposalInstruction(request.Action),
			}, "\n"),
		},
	}

	messages = append(messages, priorConversationMessages(request.Conversation)...)
	messages = append(messages, modelMessage{
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

func priorConversationMessages(conversation []ConversationMessage) []modelMessage {
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

	messages := make([]modelMessage, 0, len(conversation)-start)
	for _, message := range conversation[start:] {
		role := normalizedConversationRole(message.Role)
		content := strings.TrimSpace(message.Content)
		if content == "" {
			continue
		}
		messages = append(messages, modelMessage{
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

func editProposalInstruction(action string) string {
	switch action {
	case "fix-problem", "refactor-selection", "generate-tests":
		return "For this action, include an editProposal JSON block only when a concrete file edit is necessary. The JSON must be exactly shaped as {\"editProposal\":{\"title\":\"...\",\"files\":[{\"path\":\"absolute or workspace path\",\"summary\":\"...\",\"newContent\":\"full file content\"}]}}. Explain the change in normal text before or after the JSON."
	default:
		return "For this action, never include editProposal JSON and never create or rewrite files."
	}
}

func StreamChat(ctx context.Context, request ChatRequest, emit func(StreamEvent) error) error {
	if err := emit(StreamEvent{Type: "status", Status: "Checking local model runtime..."}); err != nil {
		return err
	}
	if err := StartRuntime(ctx); err != nil {
		return UserError{
			Field:   "runtime",
			Code:    "runtime_unavailable",
			Message: sanitizeRuntimeModelNames(err.Error()),
		}
	}

	selectedModelID := request.Model
	if strings.TrimSpace(selectedModelID) == "" {
		selectedModelID = DefaultModelID()
	}
	selectedModel := CatalogModel(selectedModelID)
	models, err := ListModels(ctx, selectedModelID)
	if err != nil {
		return err
	}
	selectedModelInstalled := false
	for _, model := range models {
		if model.ID == selectedModel.ID && model.Available {
			selectedModelInstalled = true
			break
		}
	}
	if !selectedModelInstalled {
		return UserError{
			Field:   "model",
			Code:    "model_not_installed",
			Message: selectedModel.Label + " is not installed locally. Download it before chatting.",
		}
	}

	trimProjectContextToTokenBudget(request.ProjectContext, maxProjectContextTokens)
	messages, err := buildToolAwareMessages(ctx, request, emit)
	if err != nil {
		return err
	}
	if err := emit(StreamEvent{Type: "status", Status: "Streaming response..."}); err != nil {
		return err
	}
	return streamChatMessages(ctx, request, messages, emit)
}

func buildToolAwareMessages(ctx context.Context, request ChatRequest, emit func(StreamEvent) error) ([]modelMessage, error) {
	messages := BuildMessages(request)
	if request.FolderPath == nil || strings.TrimSpace(*request.FolderPath) == "" {
		return messages, nil
	}
	if !shouldUseProjectTools(request) {
		return messages, nil
	}

	for round := 0; round < 4; round++ {
		if err := emit(StreamEvent{Type: "status", Status: fmt.Sprintf("Reading project context (step %d of 4)...", round+1)}); err != nil {
			return nil, err
		}

		planningCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
		response, err := callChatOnce(planningCtx, request, messages, true)
		cancel()
		if err != nil {
			// Tool planning is an optimization, not the user's answer. When a
			// small local model does not return tool calls quickly enough, feeding
			// the failure text back into the chat makes the model repeat that
			// backend detail to the user. Instead, Axon falls back to the
			// deterministic project probe when it can, then lets the final response
			// use the normal workspace context without leaking the planning failure.
			if probe := AutomaticProjectProbe(ctx, request); probe != "" {
				messages = append(messages, modelMessage{
					Role:    "tool",
					Content: probe,
				})
			}
			return messages, nil
		}
		if len(response.Message.ToolCalls) == 0 {
			if probe := AutomaticProjectProbe(ctx, request); probe != "" {
				if err := emit(StreamEvent{Type: "status", Status: "Scanning project files..."}); err != nil {
					return nil, err
				}
				messages = append(messages, modelMessage{
					Role:    "tool",
					Content: probe,
				})
			}
			return messages, nil
		}
		messages = append(messages, response.Message)
		for _, toolCall := range response.Message.ToolCalls {
			result := RunProjectTool(ctx, request, toolCall.Function.Name, toolCall.Function.Arguments)
			messages = append(messages, modelMessage{
				Role:    "tool",
				Content: result,
			})
		}
	}
	messages = append(messages, modelMessage{
		Role:    "tool",
		Content: "Tool limit reached. Answer with the project information already gathered.",
	})
	return messages, nil
}

func shouldUseProjectTools(request ChatRequest) bool {
	if request.Action != "ask" {
		return true
	}
	return PromptNeedsProjectContext(request.Prompt)
}

func PromptNeedsProjectContext(prompt string) bool {
	normalizedPrompt := strings.ToLower(strings.TrimSpace(prompt))
	if normalizedPrompt == "" {
		return false
	}
	greetings := map[string]bool{
		"hi": true, "hey": true, "hello": true, "yo": true,
		"hi axon": true, "hey axon": true, "hello axon": true,
	}
	if greetings[normalizedPrompt] {
		return false
	}

	projectTerms := []string{
		"file", "folder", "project", "workspace", "repo", "code", "codebase", "code base", "function",
		"method", "class", "component", "where", "find", "search", "read",
		"implement", "fix", "bug", "error", "diagnostic", "git", "diff", "see my",
	}
	for _, term := range projectTerms {
		if strings.Contains(normalizedPrompt, term) {
			return true
		}
	}
	return len(strings.Fields(normalizedPrompt)) > 6
}

func callChatOnce(ctx context.Context, request ChatRequest, messages []modelMessage, withTools bool) (modelChatResponse, error) {
	// Tool planning intentionally uses a non-streaming chat call because this
	// path needs one complete structured response before it can decide which
	// project tools to run. Streaming partial JSON would reduce perceived
	// latency on slow local models, but it would make tool-call parsing fragile
	// and could execute a half-emitted function call with incomplete arguments.
	payload := chatPayload(request, messages, false)
	if withTools {
		payload["tools"] = ProjectToolDefinitions()
	}
	rawPayload, err := json.Marshal(payload)
	if err != nil {
		return modelChatResponse{}, err
	}

	httpRequest, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		ModelBaseURL()+"/api/chat",
		bytes.NewReader(rawPayload),
	)
	if err != nil {
		return modelChatResponse{}, err
	}
	httpRequest.Header.Set("Content-Type", "application/json")

	response, err := http.DefaultClient.Do(httpRequest)
	if err != nil {
		return modelChatResponse{}, err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return modelChatResponse{}, fmt.Errorf("Axon models returned %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
	}

	var chatResponse modelChatResponse
	if err := json.NewDecoder(response.Body).Decode(&chatResponse); err != nil {
		return modelChatResponse{}, err
	}
	if chatResponse.Error != "" {
		return modelChatResponse{}, errors.New(chatResponse.Error)
	}
	return chatResponse, nil
}

func streamChatMessages(ctx context.Context, request ChatRequest, messages []modelMessage, emit func(StreamEvent) error) error {
	rawPayload, err := json.Marshal(chatPayload(request, messages, true))
	if err != nil {
		return err
	}

	httpRequest, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		ModelBaseURL()+"/api/chat",
		bytes.NewReader(rawPayload),
	)
	if err != nil {
		return err
	}
	httpRequest.Header.Set("Content-Type", "application/json")

	response, err := http.DefaultClient.Do(httpRequest)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return fmt.Errorf("Axon models returned %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
	}

	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var chunk modelStreamResponse
		if err := json.Unmarshal([]byte(line), &chunk); err != nil {
			return err
		}
		if chunk.Error != "" {
			return errors.New(chunk.Error)
		}

		delta := chunk.Response
		if chunk.Message != nil {
			delta = chunk.Message.Content
		}
		if delta != "" {
			if err := emit(StreamEvent{Type: "delta", Delta: delta}); err != nil {
				return err
			}
		}
		if chunk.Done {
			return emit(StreamEvent{Type: "done", Done: true})
		}
	}

	if err := scanner.Err(); err != nil {
		return err
	}
	return emit(StreamEvent{Type: "done", Done: true})
}

func chatPayload(request ChatRequest, messages []modelMessage, stream bool) map[string]any {
	return map[string]any{
		"model":    ModelName(request),
		"messages": messages,
		"stream":   stream,
		"options": map[string]any{
			"temperature": temperatureForAction(request.Action),
		},
	}
}

func actionInstruction(action string) string {
	switch action {
	case "explain-selection":
		return "Explain the active code clearly. Focus on behavior, data flow, edge cases, and why the code exists."
	case "fix-problem":
		return "Fix the most relevant diagnostic or problem. Prefer a precise edit proposal when a file change is needed."
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
