// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

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

type UIState struct {
	SidebarCollapsed bool     `json:"sidebarCollapsed"`
	AgentSidebarOpen bool     `json:"agentSidebarOpen"`
	TerminalOpen     bool     `json:"terminalOpen"`
	BottomPanelOpen  bool     `json:"bottomPanelOpen"`
	BottomPanelTab   *string  `json:"bottomPanelTab"`
	ZenMode          bool     `json:"zenMode"`
	ActiveFilePath   *string  `json:"activeFilePath"`
	OpenFilePaths    []string `json:"openFilePaths"`
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
	// UIState lets the editor describe what is currently on screen so UI tool
	// calls are grounded in the real workbench instead of the model guessing.
	UIState *UIState `json:"uiState,omitempty"`
	// Messages lets the editor own the agent tool loop by sending the full
	// conversation it has accumulated so far. When it is empty, axon-core builds
	// the prompt itself so the CLI and simpler callers keep their behavior.
	Messages []ModelMessage          `json:"messages,omitempty"`
	Tools    []ProjectToolDefinition `json:"tools,omitempty"`
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
	// Memory footprint and host compatibility let every surface (settings,
	// sidebar, agent runtime) agree on which models this machine can run.
	MinMemoryGB         int    `json:"minMemoryGB"`
	RecommendedMemoryGB int    `json:"recommendedMemoryGB"`
	Compatibility       string `json:"compatibility"`
}

// Model compatibility levels reported to the editor. "great" runs comfortably,
// "ok" runs but sits close to the memory ceiling, and "unsupported" should not
// be offered on the host by default.
const (
	ModelCompatibilityGreat       = "great"
	ModelCompatibilityOK          = "ok"
	ModelCompatibilityUnsupported = "unsupported"
)

type catalogModel struct {
	ID          string
	Label       string
	Description string
	RuntimeName string
	// MinMemoryGB is the smallest host memory that can load the model without
	// swapping, and RecommendedMemoryGB leaves headroom for the OS, the editor,
	// and a long context.
	MinMemoryGB         int
	RecommendedMemoryGB int
}

// modelCatalog is ordered from the smallest footprint to the largest so the UI
// can show lighter, always-runnable models first and so the default model falls
// back to the lightest entry when nothing fits.
var modelCatalog = []catalogModel{
	{
		ID:                  "axon-code-fast",
		Label:               "Axon Code Fast",
		Description:         "Fastest coding model for quick questions and small edits.",
		RuntimeName:         "qwen2.5-coder:3b",
		MinMemoryGB:         8,
		RecommendedMemoryGB: 8,
	},
	{
		ID:                  "axon-micro",
		Label:               "Axon Micro",
		Description:         "Tiny tool-capable model for low-memory machines and quick answers.",
		RuntimeName:         "qwen3:4b",
		MinMemoryGB:         8,
		RecommendedMemoryGB: 8,
	},
	{
		ID:                  "axon-code",
		Label:               "Axon Code",
		Description:         "Balanced local coding model for everyday editing, fixes, and explanations.",
		RuntimeName:         "qwen2.5-coder:7b",
		MinMemoryGB:         12,
		RecommendedMemoryGB: 16,
	},
	{
		ID:                  "axon-reason",
		Label:               "Axon Reason",
		Description:         "Reasoning-focused local model for harder debugging and planning.",
		RuntimeName:         "deepseek-r1:8b",
		MinMemoryGB:         12,
		RecommendedMemoryGB: 16,
	},
	{
		ID:                  "axon-compact",
		Label:               "Axon Compact",
		Description:         "Compact tool-capable assistant for chat and agent actions on modest machines.",
		RuntimeName:         "qwen3:8b",
		MinMemoryGB:         12,
		RecommendedMemoryGB: 12,
	},
	{
		ID:                  "axon-general",
		Label:               "Axon General",
		Description:         "General assistant with tool calling and vision for everyday work.",
		RuntimeName:         "qwen3.5:9b",
		MinMemoryGB:         16,
		RecommendedMemoryGB: 16,
	},
	{
		ID:                  "axon-agent",
		Label:               "Axon Agent",
		Description:         "Tool-calling workhorse for multi-step agent tasks; runs light but wants memory headroom.",
		RuntimeName:         "gpt-oss:20b",
		MinMemoryGB:         16,
		RecommendedMemoryGB: 24,
	},
	{
		ID:                  "axon-code-pro",
		Label:               "Axon Code Pro",
		Description:         "Strongest local coding agent with a long context for large projects.",
		RuntimeName:         "qwen3-coder:30b",
		MinMemoryGB:         24,
		RecommendedMemoryGB: 32,
	},
	{
		ID:                  "axon-frontier",
		Label:               "Axon Frontier",
		Description:         "Frontier-quality local model for demanding reasoning and agentic coding.",
		RuntimeName:         "qwen3.6:35b",
		MinMemoryGB:         32,
		RecommendedMemoryGB: 40,
	},
}

type ModelMessage struct {
	Role      string          `json:"role"`
	Content   string          `json:"content"`
	ToolCalls []ModelToolCall `json:"tool_calls,omitempty"`
}

type ModelToolCall struct {
	Function ModelToolFunction `json:"function"`
}

type ModelToolFunction struct {
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
		ToolCalls []ModelToolCall `json:"tool_calls"`
	} `json:"message"`
	Response string `json:"response"`
	Error    string `json:"error"`
	Done     bool   `json:"done"`
}

type modelChatResponse struct {
	Message ModelMessage `json:"message"`
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
	return RuntimeModelName(DefaultModelID())
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

// DefaultModelID picks the most capable model that still runs comfortably on
// the host. When nothing is a comfortable fit it falls back to the lightest
// catalog entry so a fresh install always has a usable selection.
func DefaultModelID() string {
	hostMemoryGB := HostMemoryGB()
	defaultModelID := ""
	for _, model := range modelCatalog {
		if modelCompatibility(hostMemoryGB, model.MinMemoryGB, model.RecommendedMemoryGB) == ModelCompatibilityGreat {
			defaultModelID = model.ID
		}
	}
	if defaultModelID != "" {
		return defaultModelID
	}
	return modelCatalog[0].ID
}

// modelCompatibility classifies a model against the host memory. A zero host
// value means detection failed, so the model is treated as comfortable to avoid
// hiding the whole catalog.
func modelCompatibility(hostMemoryGB, minMemoryGB, recommendedMemoryGB int) string {
	if hostMemoryGB <= 0 {
		return ModelCompatibilityGreat
	}
	if hostMemoryGB >= recommendedMemoryGB {
		return ModelCompatibilityGreat
	}
	if hostMemoryGB >= minMemoryGB {
		return ModelCompatibilityOK
	}
	return ModelCompatibilityUnsupported
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
	hostMemoryGB := HostMemoryGB()
	models := make([]ModelInfo, 0, len(modelCatalog))
	for _, model := range modelCatalog {
		models = append(models, ModelInfo{
			ID:                  model.ID,
			Label:               model.Label,
			Description:         model.Description,
			ProviderLabel:       "Axon models",
			Available:           installedRuntimeModels != nil && installedRuntimeModels[model.RuntimeName],
			MinMemoryGB:         model.MinMemoryGB,
			RecommendedMemoryGB: model.RecommendedMemoryGB,
			Compatibility:       modelCompatibility(hostMemoryGB, model.MinMemoryGB, model.RecommendedMemoryGB),
		})
	}
	return models
}

func StreamChat(ctx context.Context, request ChatRequest, emit func(StreamEvent) error) error {
	if err := emit(StreamEvent{Type: "status", Status: "Checking local model runtime..."}); err != nil {
		return err
	}
	if err := ensureModelReady(ctx, request); err != nil {
		return err
	}

	// A caller that sends Messages already owns the conversation and the agent
	// tool loop, so core just streams the final reply. The CLI sends no messages,
	// which keeps the original behavior where core builds the prompt and runs the
	// project tool loop itself.
	messages := request.Messages
	if len(messages) == 0 {
		trimProjectContextToTokenBudget(request.ProjectContext, maxProjectContextTokens)
		builtMessages, err := buildToolAwareMessages(ctx, request, emit)
		if err != nil {
			return err
		}
		messages = builtMessages
	}
	if err := emit(StreamEvent{Type: "status", Status: "Streaming response..."}); err != nil {
		return err
	}
	return streamChatMessages(ctx, request, messages, emit)
}

// TurnResult is one non-streaming planning turn. Messages carries the base
// conversation the turn ran against so a caller that started with none keeps the
// built system and project context, and Message is the assistant reply whose
// ToolCalls decide what runs next.
type TurnResult struct {
	Messages []ModelMessage `json:"messages"`
	Message  ModelMessage   `json:"message"`
}

// PlanTurn runs a single non-streaming model turn with the caller-supplied
// tools and returns the assistant reply. It never executes a tool: the editor
// owns the loop because UI actions can only run in the renderer, so this answers
// only what the model wants to do next.
func PlanTurn(ctx context.Context, request ChatRequest) (TurnResult, error) {
	if err := ensureModelReady(ctx, request); err != nil {
		return TurnResult{}, err
	}

	messages := request.Messages
	if len(messages) == 0 {
		trimProjectContextToTokenBudget(request.ProjectContext, maxProjectContextTokens)
		messages = BuildMessages(request)
	}
	response, err := callChatOnce(ctx, request, messages, request.Tools)
	if err != nil {
		return TurnResult{}, err
	}
	return TurnResult{Messages: messages, Message: response.Message}, nil
}

// ensureModelReady makes sure the local runtime is up and the requested model is
// installed. Both the self-contained and caller-driven chat paths share it so
// the failure modes stay identical no matter who owns the tool loop.
func ensureModelReady(ctx context.Context, request ChatRequest) error {
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
	for _, model := range models {
		if model.ID == selectedModel.ID && model.Available {
			return nil
		}
	}
	return UserError{
		Field:   "model",
		Code:    "model_not_installed",
		Message: selectedModel.Label + " is not installed locally. Download it before chatting.",
	}
}

func buildToolAwareMessages(ctx context.Context, request ChatRequest, emit func(StreamEvent) error) ([]ModelMessage, error) {
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
		response, err := callChatOnce(planningCtx, request, messages, ProjectToolDefinitions())
		cancel()
		if err != nil {
			// Tool planning is an optimization, not the user's answer. When a
			// small local model does not return tool calls quickly enough, feeding
			// the failure text back into the chat makes the model repeat that
			// backend detail to the user. Instead, Axon falls back to the
			// deterministic project probe when it can, then lets the final response
			// use the normal workspace context without leaking the planning failure.
			if probe := AutomaticProjectProbe(ctx, request); probe != "" {
				messages = append(messages, ModelMessage{
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
				messages = append(messages, ModelMessage{
					Role:    "tool",
					Content: probe,
				})
			}
			return messages, nil
		}
		messages = append(messages, response.Message)
		for _, toolCall := range response.Message.ToolCalls {
			result := RunProjectTool(ctx, request, toolCall.Function.Name, toolCall.Function.Arguments)
			messages = append(messages, ModelMessage{
				Role:    "tool",
				Content: result,
			})
		}
	}
	messages = append(messages, ModelMessage{
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

func callChatOnce(ctx context.Context, request ChatRequest, messages []ModelMessage, tools []ProjectToolDefinition) (modelChatResponse, error) {
	// Tool planning intentionally uses a non-streaming chat call because this
	// path needs one complete structured response before it can decide which
	// project tools to run. Streaming partial JSON would reduce perceived
	// latency on slow local models, but it would make tool-call parsing fragile
	// and could execute a half-emitted function call with incomplete arguments.
	payload := chatPayload(request, messages, false)
	if len(tools) > 0 {
		payload["tools"] = tools
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

func streamChatMessages(ctx context.Context, request ChatRequest, messages []ModelMessage, emit func(StreamEvent) error) error {
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

// modelKeepAlive keeps the local model resident between requests. Without it the
// runtime unloads the weights after a short idle window, so every chat pays the
// model load cost again on its first token. Every path that talks to the runtime
// sets the same value so the model stays warm across chat, planning, and inline
// completions.
const modelKeepAlive = "30m"

func chatPayload(request ChatRequest, messages []ModelMessage, stream bool) map[string]any {
	return map[string]any{
		"model":      ModelName(request),
		"messages":   messages,
		"stream":     stream,
		"keep_alive": modelKeepAlive,
		"options": map[string]any{
			"temperature": temperatureForAction(request.Action),
		},
	}
}
