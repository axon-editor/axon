// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package client

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

	"github.com/GordenArcher/axon-core/internal/agentcli/coreproc"
	"github.com/GordenArcher/axon-core/internal/ai"
)

type streamEnvelope struct {
	Status  string          `json:"status"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

// Ready resolves the core port and ensures the background service is up. The
// agent loop calls it once, then reuses the port for planning, tools, and the
// final stream.
func Ready(ctx context.Context, folderPath string) (string, string, error) {
	port := coreproc.ResolveCorePort()
	if err := coreproc.EnsureCore(ctx, port); err != nil {
		return "", "", err
	}

	folder := strings.TrimSpace(folderPath)
	if folder == "" {
		workingDirectory, err := os.Getwd()
		if err != nil {
			return "", "", err
		}
		folder = workingDirectory
	}
	return port, folder, nil
}

// StreamChat sends the accumulated conversation to core and forwards the
// streamed answer. It never runs core's own tool loop because Messages is set.
func StreamChat(ctx context.Context, port string, request Request, emit func(Event) error) error {
	envelope := ai.ChatRequest{
		Action:     "agent",
		Prompt:     request.Prompt,
		FolderPath: &request.FolderPath,
		Model:      request.Model,
		Messages:   request.Messages,
		Tools:      request.Tools,
	}
	if len(request.Messages) == 0 {
		envelope.Conversation = request.Conversation
		envelope.History = request.History
	}

	response, err := postStream(ctx, port, "/ai/chat/stream", envelope)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	return readStream(response.Body, func(event ai.StreamEvent) error {
		switch event.Type {
		case "status":
			if event.Status != "" {
				return emit(Event{Kind: Status, Text: event.Status})
			}
		case "thought":
			if event.Thought != "" {
				return emit(Event{Kind: Thought, Text: event.Thought})
			}
		case "delta":
			if event.Delta != "" {
				return emit(Event{Kind: Delta, Text: event.Delta})
			}
		case "tool_start":
			return emit(Event{
				Kind:       ToolStart,
				ToolCallID: event.ToolCallID,
				ToolName:   event.ToolName,
				Arguments:  string(event.Arguments),
			})
		case "tool_result":
			return emit(Event{
				Kind:       ToolResult,
				ToolCallID: event.ToolCallID,
				ToolName:   event.ToolName,
				Result:     event.Result,
				OK:         event.OK,
				DurationMS: event.DurationMS,
			})
		}
		if event.Type == "done" || event.Done {
			return emit(Event{Kind: Done})
		}
		return nil
	})
}

func postStream(
	ctx context.Context,
	port string,
	path string,
	request ai.ChatRequest,
) (*http.Response, error) {
	payload, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}

	httpRequest, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		coreproc.CoreURL(port, path),
		bytes.NewReader(payload),
	)
	if err != nil {
		return nil, err
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	coreproc.AuthorizeCoreRequest(httpRequest)

	response, err := http.DefaultClient.Do(httpRequest)
	if err != nil {
		return nil, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		_ = response.Body.Close()
		return nil, fmt.Errorf(
			"Axon Agent request failed: %s",
			strings.TrimSpace(string(body)),
		)
	}
	return response, nil
}

func readStream(body io.Reader, handle func(ai.StreamEvent) error) error {
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var envelope streamEnvelope
		if err := json.Unmarshal([]byte(line), &envelope); err != nil {
			return err
		}
		if envelope.Status == "error" {
			return fmt.Errorf("%s", envelope.Message)
		}

		var event ai.StreamEvent
		if err := json.Unmarshal(envelope.Data, &event); err != nil {
			return err
		}
		if err := handle(event); err != nil {
			return err
		}
		if event.Type == "done" || event.Done {
			return nil
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	return errors.New("Axon Agent stream ended before completion")
}

func sendError(ctx context.Context, events chan<- Event, err error) {
	if ctx.Err() != nil {
		events <- Event{Kind: Cancelled, Text: "Cancelled."}
		return
	}
	events <- Event{Kind: Error, Text: err.Error()}
}
