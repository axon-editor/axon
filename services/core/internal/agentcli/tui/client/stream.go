// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package client

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

	"github.com/GordenArcher/axon-core/internal/agentcli/coreproc"
	"github.com/GordenArcher/axon-core/internal/ai"
)

type EventKind int

const (
	Status EventKind = iota
	Delta
	Done
	Cancelled
	Error
)

type Event struct {
	Kind EventKind
	Text string
}

type Request struct {
	Conversation []ai.ConversationMessage
	FolderPath   string
	Model        string
	Prompt       string
}

type streamEnvelope struct {
	Status  string          `json:"status"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

// Stream sends one agent turn to axon-core and forwards the parts the TUI can
// render. The existing `stream` package owns the one-shot terminal renderer;
// this client is the callback-free equivalent for a full-screen program.
func Stream(ctx context.Context, request Request, events chan<- Event) {
	defer close(events)

	events <- Event{Kind: Status, Text: "Connecting to Axon..."}

	port := coreproc.ResolveCorePort()
	if err := coreproc.EnsureCore(ctx, port); err != nil {
		sendError(ctx, events, err)
		return
	}

	folderPath := strings.TrimSpace(request.FolderPath)
	if folderPath == "" {
		var err error
		folderPath, err = os.Getwd()
		if err != nil {
			sendError(ctx, events, err)
			return
		}
	}

	payload, err := json.Marshal(ai.ChatRequest{
		Action:       "agent",
		Prompt:       request.Prompt,
		FolderPath:   &folderPath,
		Conversation: request.Conversation,
		Model:        request.Model,
	})
	if err != nil {
		sendError(ctx, events, err)
		return
	}

	httpRequest, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		coreproc.CoreURL(port, "/ai/chat/stream"),
		bytes.NewReader(payload),
	)
	if err != nil {
		sendError(ctx, events, err)
		return
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	coreproc.AuthorizeCoreRequest(httpRequest)

	response, err := http.DefaultClient.Do(httpRequest)
	if err != nil {
		sendError(ctx, events, err)
		return
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		sendError(ctx, events, fmt.Errorf("Axon Agent request failed: %s", strings.TrimSpace(string(body))))
		return
	}

	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var envelope streamEnvelope
		if err := json.Unmarshal([]byte(line), &envelope); err != nil {
			sendError(ctx, events, err)
			return
		}
		if envelope.Status == "error" {
			sendError(ctx, events, fmt.Errorf("%s", envelope.Message))
			return
		}

		var event ai.StreamEvent
		if err := json.Unmarshal(envelope.Data, &event); err != nil {
			sendError(ctx, events, err)
			return
		}

		switch event.Type {
		case "status":
			if event.Status != "" {
				events <- Event{Kind: Status, Text: event.Status}
			}
		case "delta":
			if event.Delta != "" {
				events <- Event{Kind: Delta, Text: event.Delta}
			}
		}

		if event.Type == "done" || event.Done {
			events <- Event{Kind: Done}
			return
		}
	}

	if err := scanner.Err(); err != nil {
		sendError(ctx, events, err)
		return
	}
	events <- Event{Kind: Done}
}

func sendError(ctx context.Context, events chan<- Event, err error) {
	if ctx.Err() != nil {
		events <- Event{Kind: Cancelled, Text: "Cancelled."}
		return
	}
	events <- Event{Kind: Error, Text: err.Error()}
}
