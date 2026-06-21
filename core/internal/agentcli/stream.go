package agentcli

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/GordenArcher/axon-core/internal/ai"
)

// streamRequestInput is the small command-level shape before it becomes the
// full ai.ChatRequest sent to core. Keeping this separate prevents ask and
// commit from needing to know about every renderer chat field.
type streamRequestInput struct {
	Action      string
	Prompt      string
	FolderPath  string
	Diagnostics []ai.Diagnostic
	GitDiff     string
}

// streamEnvelope is the NDJSON envelope emitted by axon-core for each stream
// line. The CLI parses the same success/error contract as the renderer, so
// terminal behavior stays aligned with the app instead of inventing a second
// response format.
type streamEnvelope struct {
	Status     string              `json:"status"`
	HTTPStatus int                 `json:"http_status"`
	Message    string              `json:"message"`
	Data       json.RawMessage     `json:"data"`
	Errors     map[string][]string `json:"errors"`
	Code       any                 `json:"code"`
	RequestID  string              `json:"request_id"`
	Meta       any                 `json:"meta"`
}

// streamAgentRequest sends the same request shape the renderer uses, then
// prints each streamed delta as soon as core emits it. The terminal should feel
// like a real editor surface, so we do not wait for the full model response
// before showing output.
func streamAgentRequest(ctx context.Context, input streamRequestInput) (string, error) {
	port := resolveCorePort()
	if err := ensureCore(ctx, port); err != nil {
		return "", err
	}

	folderPath := strings.TrimSpace(input.FolderPath)
	if folderPath == "" {
		var err error
		folderPath, err = os.Getwd()
		if err != nil {
			return "", err
		}
	}

	request := ai.ChatRequest{
		Action:      input.Action,
		Prompt:      input.Prompt,
		FolderPath:  &folderPath,
		Diagnostics: input.Diagnostics,
		GitDiff:     input.GitDiff,
		Model:       defaultModelID(),
	}

	// Project context is best-effort here because the useful behavior is still
	// to answer from the current workspace path and backend tools if a context
	// pack cannot be built. This prevents one stale folder, permission issue, or
	// oversized workspace scan from making every terminal AI command unusable.
	if contextPack, err := fetchProjectContext(ctx, port, folderPath); err == nil {
		request.ProjectContext = &contextPack
	} else {
		fmt.Fprintln(os.Stderr, dim("Project context unavailable; continuing with workspace path only."))
	}

	rawPayload, err := json.Marshal(request)
	if err != nil {
		return "", err
	}

	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, coreURL(port, "/ai/chat/stream"), bytes.NewReader(rawPayload))
	if err != nil {
		return "", err
	}
	httpRequest.Header.Set("Content-Type", "application/json")

	fmt.Fprintln(os.Stderr, dim("Thinking..."))
	response, err := http.DefaultClient.Do(httpRequest)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return "", fmt.Errorf("Axon Agent request failed: %s", strings.TrimSpace(string(body)))
	}

	var fullResponse strings.Builder
	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		// The stream uses Axon's normal response envelope on every NDJSON line.
		// That keeps CLI behavior aligned with the renderer contract: errors are
		// top-level envelope errors, while successful lines carry ai.StreamEvent
		// payloads inside data.
		var envelope streamEnvelope
		if err := json.Unmarshal([]byte(line), &envelope); err != nil {
			return fullResponse.String(), err
		}
		if envelope.Status == "error" {
			return fullResponse.String(), fmt.Errorf("%s", envelope.Message)
		}
		var event ai.StreamEvent
		if err := json.Unmarshal(envelope.Data, &event); err != nil {
			return fullResponse.String(), err
		}
		if event.Type == "delta" && event.Delta != "" {
			fmt.Print(white(event.Delta))
			fullResponse.WriteString(event.Delta)
		}
		if event.Type == "done" || event.Done {
			fmt.Println()
			return strings.TrimSpace(fullResponse.String()), nil
		}
	}
	if err := scanner.Err(); err != nil {
		return fullResponse.String(), err
	}
	fmt.Println()
	return strings.TrimSpace(fullResponse.String()), nil
}

// defaultModelID chooses the faster local coding model for terminal commands.
// The environment override is intentionally kept for development and debugging
// without exposing raw runtime model names in normal CLI usage.
func defaultModelID() string {
	if modelID := strings.TrimSpace(os.Getenv("AXON_AGENT_MODEL")); modelID != "" {
		return modelID
	}
	return "axon-code-fast"
}
