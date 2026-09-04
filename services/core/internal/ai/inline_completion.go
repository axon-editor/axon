package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"unicode/utf8"
)

const (
	maxInlineCompletionPrefixBytes = 16_000
	maxInlineCompletionSuffixBytes = 6_000
	maxInlineCompletionBytes       = 600
	maxInlineCompletionLines       = 6
)

type InlineCompletionRequest struct {
	FolderPath *string `json:"folderPath"`
	FilePath   string  `json:"filePath"`
	LanguageID string  `json:"languageId"`
	Prefix     string  `json:"prefix"`
	Suffix     string  `json:"suffix"`
	Line       int     `json:"line"`
	Column     int     `json:"column"`
	Model      string  `json:"model"`
}

type InlineCompletionResult struct {
	Success       bool   `json:"success"`
	Completion    string `json:"completion"`
	Message       string `json:"message"`
	ModelLabel    string `json:"modelLabel"`
	ProviderLabel string `json:"providerLabel"`
}

func CompleteInline(ctx context.Context, request InlineCompletionRequest) (InlineCompletionResult, error) {
	if strings.TrimSpace(request.FilePath) == "" {
		return InlineCompletionResult{}, UserError{
			Field:   "filePath",
			Code:    "file_path_required",
			Message: "A file path is required for inline completion.",
		}
	}
	if strings.TrimSpace(request.Prefix) == "" {
		return emptyInlineCompletion(request), nil
	}
	if err := StartRuntime(ctx); err != nil {
		return InlineCompletionResult{}, UserError{
			Field:   "runtime",
			Code:    "runtime_unavailable",
			Message: sanitizeRuntimeModelNames(err.Error()),
		}
	}

	selectedModelID := strings.TrimSpace(request.Model)
	if selectedModelID == "" {
		selectedModelID = DefaultModelID()
	}
	selectedModel := CatalogModel(selectedModelID)
	models, err := ListModels(ctx, selectedModelID)
	if err != nil {
		return InlineCompletionResult{}, err
	}
	selectedModelInstalled := false
	for _, model := range models {
		if model.ID == selectedModel.ID && model.Available {
			selectedModelInstalled = true
			break
		}
	}
	if !selectedModelInstalled {
		return InlineCompletionResult{}, UserError{
			Field:   "model",
			Code:    "model_not_installed",
			Message: selectedModel.Label + " is not installed locally. Download it before using inline AI completion.",
		}
	}

	response, err := callInlineCompletionModel(ctx, request)
	if err != nil {
		return InlineCompletionResult{}, err
	}
	completion := CleanInlineCompletion(response.Message.Content, request)
	if completion == "" {
		return emptyInlineCompletion(request), nil
	}

	return InlineCompletionResult{
		Success:       true,
		Completion:    completion,
		Message:       "Generated inline completion.",
		ModelLabel:    selectedModel.Label,
		ProviderLabel: "Axon models",
	}, nil
}

func emptyInlineCompletion(request InlineCompletionRequest) InlineCompletionResult {
	selectedModelID := strings.TrimSpace(request.Model)
	if selectedModelID == "" {
		selectedModelID = DefaultModelID()
	}
	selectedModel := CatalogModel(selectedModelID)
	return InlineCompletionResult{
		Success:       true,
		Completion:    "",
		Message:       "No inline completion available.",
		ModelLabel:    selectedModel.Label,
		ProviderLabel: "Axon models",
	}
}

func callInlineCompletionModel(ctx context.Context, request InlineCompletionRequest) (modelChatResponse, error) {
	rawPayload, err := json.Marshal(map[string]any{
		"model": ModelName(ChatRequest{Model: request.Model}),
		"messages": []modelMessage{
			{
				Role: "system",
				Content: strings.Join([]string{
					"You are Axon's inline code completion engine.",
					"Return only the code text that should be inserted at the cursor.",
					"Do not explain, do not use markdown, and do not repeat existing code before the cursor.",
					"Prefer the smallest useful continuation. If no useful completion exists, return an empty string.",
				}, "\n"),
			},
			{
				Role:    "user",
				Content: inlineCompletionPrompt(request),
			},
		},
		"stream": false,
		"options": map[string]any{
			"temperature": 0.08,
			"num_predict": 96,
		},
	})
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

	var completionResponse modelChatResponse
	if err := json.NewDecoder(response.Body).Decode(&completionResponse); err != nil {
		return modelChatResponse{}, err
	}
	if completionResponse.Error != "" {
		return modelChatResponse{}, errors.New(completionResponse.Error)
	}
	return completionResponse, nil
}

func inlineCompletionPrompt(request InlineCompletionRequest) string {
	return strings.Join([]string{
		"File: " + strings.TrimSpace(request.FilePath),
		"Language: " + strings.TrimSpace(request.LanguageID),
		fmt.Sprintf("Cursor: line %d, column %d", request.Line, request.Column),
		"Insert text at <CURSOR>. Return only inserted text.",
		"",
		"<PREFIX>",
		trimForPrompt(request.Prefix, maxInlineCompletionPrefixBytes),
		"</PREFIX>",
		"<SUFFIX>",
		trimForPrompt(request.Suffix, maxInlineCompletionSuffixBytes),
		"</SUFFIX>",
	}, "\n")
}

func CleanInlineCompletion(raw string, request InlineCompletionRequest) string {
	completion := strings.ReplaceAll(raw, "\r\n", "\n")
	completion = strings.ReplaceAll(completion, "\r", "\n")
	completion = strings.Trim(completion, "\n")
	completion = stripInlineCodeFence(completion)
	completion = strings.Trim(completion, "\n")

	if isExplanatoryInlineCompletion(completion) {
		return ""
	}

	completion = stripEchoedInlinePrefix(completion, request.Prefix)
	completion = strings.Trim(completion, "\n")
	if strings.TrimSpace(completion) == "" {
		return ""
	}
	if suffixAlreadyHasCompletion(request.Suffix, completion) {
		return ""
	}

	return limitInlineCompletion(completion)
}

func stripInlineCodeFence(value string) string {
	lines := strings.Split(value, "\n")
	if len(lines) == 0 {
		return value
	}

	firstLine := strings.TrimSpace(lines[0])
	if !strings.HasPrefix(firstLine, "```") {
		return value
	}
	lines = lines[1:]
	if len(lines) > 0 && strings.TrimSpace(lines[len(lines)-1]) == "```" {
		lines = lines[:len(lines)-1]
	}
	return strings.Join(lines, "\n")
}

func isExplanatoryInlineCompletion(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return false
	}
	lower := strings.ToLower(trimmed)
	prosePrefixes := []string{
		"sure",
		"here is",
		"here's",
		"the completion",
		"i would",
		"you can",
		"as an ai",
	}
	for _, prefix := range prosePrefixes {
		if strings.HasPrefix(lower, prefix) {
			return true
		}
	}
	return false
}

func stripEchoedInlinePrefix(completion string, prefix string) string {
	currentLine := prefix
	if lastNewline := strings.LastIndex(currentLine, "\n"); lastNewline >= 0 {
		currentLine = currentLine[lastNewline+1:]
	}
	if currentLine == "" {
		return completion
	}
	if strings.HasPrefix(completion, currentLine) {
		return strings.TrimPrefix(completion, currentLine)
	}

	trimmedCompletion := strings.TrimLeft(completion, " \t")
	trimmedLine := strings.TrimSpace(currentLine)
	if trimmedLine != "" && strings.HasPrefix(trimmedCompletion, trimmedLine) {
		return strings.TrimPrefix(trimmedCompletion, trimmedLine)
	}
	return completion
}

func suffixAlreadyHasCompletion(suffix string, completion string) bool {
	trimmedSuffix := strings.TrimLeft(suffix, " \t\n")
	trimmedCompletion := strings.TrimSpace(completion)
	return trimmedCompletion != "" && strings.HasPrefix(trimmedSuffix, trimmedCompletion)
}

func limitInlineCompletion(value string) string {
	lines := strings.Split(value, "\n")
	if len(lines) > maxInlineCompletionLines {
		lines = lines[:maxInlineCompletionLines]
	}
	limited := strings.Join(lines, "\n")
	if len(limited) <= maxInlineCompletionBytes {
		return limited
	}

	byteCount := 0
	for byteCount < len(limited) {
		_, size := utf8.DecodeRuneInString(limited[byteCount:])
		if byteCount+size > maxInlineCompletionBytes {
			break
		}
		byteCount += size
	}
	return limited[:byteCount]
}
