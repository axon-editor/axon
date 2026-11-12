// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package run

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	opencodeclient "github.com/GordenArcher/axon-core/internal/agentcli/opencode/client"
	"github.com/GordenArcher/axon-core/internal/agentcli/opencode/server"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
)

const (
	maxHistoryMessages = 20
	historyMessageCap  = 4000
	titleLength        = 60
	interruptTimeout   = 2 * time.Second
)

// errStreamDone is a local sentinel. The provider keeps the SSE connection open
// after the terminal event, so the scanner has to be told to stop instead of
// waiting for a close that never comes.
var errStreamDone = errors.New("opencode stream finished")

// Run owns one OpenCode turn. The provider executes the tools, so the CLI only
// forwards text, tool cards, and permission prompts into the same event channel
// the local agent loop uses.
func Run(ctx context.Context, request client.Request, events chan<- client.Event) {
	emit := func(event client.Event) error {
		select {
		case events <- event:
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	}

	if err := run(ctx, request, emit); err != nil {
		if ctx.Err() != nil {
			_ = emit(client.Event{Kind: client.Cancelled, Text: "Cancelled."})
			return
		}
		_ = emit(client.Event{Kind: client.Error, Text: err.Error()})
	}
}

// run is separated from Run so the failure path can translate context
// cancellation into the same Cancelled event the local agent loop emits.
func run(
	ctx context.Context,
	request client.Request,
	emit func(client.Event) error,
) error {
	handle, err := server.Ensure(ctx, request.FolderPath)
	if err != nil {
		return err
	}
	api := opencodeclient.New(handle)

	model, err := parseModel(request)
	if err != nil {
		return err
	}
	sessionID, isNew, err := resolveSession(ctx, api, request, model)
	if err != nil {
		return err
	}
	if err := emit(client.Event{
		Kind:             client.Session,
		BackendSessionID: sessionID,
	}); err != nil {
		return err
	}

	body, err := api.Events(ctx)
	if err != nil {
		return err
	}
	defer body.Close()

	if err := emit(client.Event{Kind: client.Status, Text: "Working..."}); err != nil {
		return err
	}
	if err := api.Prompt(ctx, sessionID, buildPrompt(request, isNew)); err != nil {
		return err
	}

	handler := newHandler(ctx, api, sessionID, emit, request.Decisions)
	result := make(chan error, 1)
	go func() {
		result <- opencodeclient.ScanEvents(body, func(event opencodeclient.Event) error {
			if err := handler.handle(event); err != nil {
				return err
			}
			if handler.done {
				return errStreamDone
			}
			return nil
		})
	}()

	select {
	case err := <-result:
		if errors.Is(err, errStreamDone) {
			return nil
		}
		if err != nil {
			return err
		}
		if handler.done {
			return nil
		}
		return errors.New("OpenCode event stream disconnected")
	case <-ctx.Done():
		interrupt(api, sessionID)
		return ctx.Err()
	}
}

// parseModel accepts the split fields first because the catalog already knows
// them. Splitting the id is the fallback for a model restored from config
// before the catalog finished loading.
func parseModel(request client.Request) (opencodeclient.SessionModel, error) {
	if request.ProviderID != "" && request.ModelID != "" {
		return opencodeclient.SessionModel{
			ProviderID: request.ProviderID,
			ID:         request.ModelID,
		}, nil
	}
	separator := strings.IndexByte(request.Model, '/')
	if separator <= 0 || separator == len(request.Model)-1 {
		return opencodeclient.SessionModel{}, errors.New(
			"an OpenCode provider/model pair is required",
		)
	}
	return opencodeclient.SessionModel{
		ProviderID: request.Model[:separator],
		ID:         request.Model[separator+1:],
	}, nil
}

// resolveSession reuses the provider session saved with the CLI conversation.
// If the provider no longer knows that id, creating a new session is better
// than failing the turn the user just typed.
func resolveSession(
	ctx context.Context,
	api *opencodeclient.Client,
	request client.Request,
	model opencodeclient.SessionModel,
) (string, bool, error) {
	if sessionID := strings.TrimSpace(request.BackendSessionID); sessionID != "" {
		if err := api.SetModel(ctx, sessionID, model); err == nil {
			return sessionID, false, nil
		}
	}

	title := strings.TrimSpace(request.Prompt)
	if runes := []rune(title); len(runes) > titleLength {
		title = string(runes[:titleLength])
	}
	if title == "" {
		title = "Axon conversation"
	}
	session, err := api.CreateSession(ctx, request.FolderPath, model, title)
	if err != nil {
		return "", false, err
	}
	return session.ID, true, nil
}

// buildPrompt only carries the prior transcript into a brand-new provider
// session. Once OpenCode owns the session it already has the history, and
// resending it would duplicate every earlier turn on each prompt.
func buildPrompt(request client.Request, isNew bool) string {
	if !isNew || len(request.History) == 0 {
		return request.Prompt
	}
	lines := make([]string, 0, maxHistoryMessages)
	for _, message := range request.History {
		if message.Role != "user" && message.Role != "assistant" {
			continue
		}
		content := strings.TrimSpace(message.Content)
		if content == "" {
			continue
		}
		if runes := []rune(content); len(runes) > historyMessageCap {
			content = string(runes[:historyMessageCap])
		}
		label := "User"
		if message.Role == "assistant" {
			label = "Assistant"
		}
		lines = append(lines, label+": "+content)
		if len(lines) >= maxHistoryMessages {
			break
		}
	}
	if len(lines) == 0 {
		return request.Prompt
	}
	return fmt.Sprintf(
		"[Prior conversation]\n%s\n\n[Current request]\n%s",
		strings.Join(lines, "\n\n"),
		request.Prompt,
	)
}

// interrupt gets its own context because cancellation already killed the one
// the run was using. Without this call the provider would keep working after
// the TUI returns to Ready.
func interrupt(api *opencodeclient.Client, sessionID string) {
	ctx, cancel := context.WithTimeout(context.Background(), interruptTimeout)
	defer cancel()
	_ = api.Interrupt(ctx, sessionID)
}
