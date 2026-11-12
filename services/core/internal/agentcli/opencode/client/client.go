// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/opencode/server"
)

const (
	requestTimeout = 60 * time.Second
	errorBodyLimit = 4096
)

// Client is the narrow HTTP surface the CLI needs. Keeping it separate from the
// server lifecycle means a test can point a client at a fake server without
// spawning OpenCode.
type Client struct {
	baseURL       string
	authorization string
	http          *http.Client
}

// New binds a client to one managed server. The password is captured here so
// callers cannot accidentally mix a handle from one workspace with another.
func New(handle *server.Handle) *Client {
	return &Client{
		baseURL:       handle.BaseURL,
		authorization: handle.Authorization(),
		http:          &http.Client{Timeout: requestTimeout},
	}
}

// request returns the response body as an error detail on failure. OpenCode
// often explains the real problem there, and dropping it leaves the TUI with a
// bare status code that cannot tell the user what to fix.
func (c *Client) request(
	ctx context.Context,
	method string,
	path string,
	body any,
	output any,
) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", c.authorization)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := c.http.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		detail, _ := io.ReadAll(io.LimitReader(response.Body, errorBodyLimit))
		return fmt.Errorf(
			"OpenCode %s %s returned %d: %s",
			method,
			path,
			response.StatusCode,
			strings.TrimSpace(string(detail)),
		)
	}
	if output == nil || response.StatusCode == http.StatusNoContent {
		return nil
	}
	return json.NewDecoder(response.Body).Decode(output)
}

// Models returns the catalog entries the picker can offer. Filtering by type
// and deprecation happens in the catalog loader so this layer stays a mirror of
// the provider response.
func (c *Client) Models(ctx context.Context) ([]Model, error) {
	var response ModelResponse
	if err := c.request(ctx, http.MethodGet, "/api/model", nil, &response); err != nil {
		return nil, err
	}
	return response.Data, nil
}

// Providers supplies the display names the picker groups on. Falling back to
// the provider id is safe but produces headings like "opencode-go", which is a
// worse catalog than the user sees in the sidebar.
func (c *Client) Providers(ctx context.Context) ([]Provider, error) {
	var response ProviderResponse
	if err := c.request(ctx, http.MethodGet, "/api/provider", nil, &response); err != nil {
		return nil, err
	}
	return response.Data, nil
}

// CreateSession starts a server-side conversation. The directory travels with
// the session because OpenCode scopes file tools to the workspace it was told
// about, not to the CLI's process working directory.
func (c *Client) CreateSession(
	ctx context.Context,
	directory string,
	model SessionModel,
	title string,
) (Session, error) {
	var response SessionResponse
	err := c.request(ctx, http.MethodPost, "/api/session", map[string]any{
		"title":    title,
		"model":    model,
		"location": map[string]string{"directory": directory},
	}, &response)
	return response.Data, err
}

// SetModel switches an existing session when the user picks a different model
// for the same conversation. Recreating the session would lose its history.
func (c *Client) SetModel(
	ctx context.Context,
	sessionID string,
	model SessionModel,
) error {
	return c.request(
		ctx,
		http.MethodPost,
		"/api/session/"+sessionID+"/model",
		map[string]any{"model": model},
		nil,
	)
}

// Prompt submits the turn. OpenCode streams everything else over the event
// bus, so the response body here carries no transcript text.
func (c *Client) Prompt(ctx context.Context, sessionID, text string) error {
	return c.request(
		ctx,
		http.MethodPost,
		"/api/session/"+sessionID+"/prompt",
		map[string]string{"text": text},
		nil,
	)
}

// Interrupt asks the provider to stop the turn. The CLI also cancels its local
// context, but the server keeps working unless it receives this call.
func (c *Client) Interrupt(ctx context.Context, sessionID string) error {
	return c.request(
		ctx,
		http.MethodPost,
		"/api/session/"+sessionID+"/interrupt",
		nil,
		nil,
	)
}

// ReplyPermission maps the CLI decision onto OpenCode's vocabulary. "always"
// is only sent when the user chose the session-wide allow option, because that
// decision survives the current turn on the provider side too.
func (c *Client) ReplyPermission(
	ctx context.Context,
	sessionID string,
	requestID string,
	decision string,
	message string,
) error {
	body := map[string]string{"decision": decision}
	if message != "" {
		body["message"] = message
	}
	return c.request(
		ctx,
		http.MethodPost,
		"/api/session/"+sessionID+"/permission/"+requestID+"/reply",
		body,
		nil,
	)
}

// Events opens the long-lived SSE stream. The caller owns the response body.
func (c *Client) Events(ctx context.Context) (io.ReadCloser, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/event", nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", c.authorization)
	request.Header.Set("Accept", "text/event-stream")
	response, err := c.http.Do(request)
	if err != nil {
		return nil, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		detail, _ := io.ReadAll(io.LimitReader(response.Body, errorBodyLimit))
		_ = response.Body.Close()
		return nil, fmt.Errorf(
			"OpenCode event stream returned %d: %s",
			response.StatusCode,
			strings.TrimSpace(string(detail)),
		)
	}
	return response.Body, nil
}
