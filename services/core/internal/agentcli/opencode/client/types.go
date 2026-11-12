// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package client

// These types mirror only the OpenCode v2 fields the CLI consumes. Importing
// the provider's full schema would make the terminal brittle to every internal
// rename, while unknown fields can be ignored without losing behavior.
type Model struct {
	ID           string `json:"id"`
	ModelID      string `json:"modelID"`
	ProviderID   string `json:"providerID"`
	Type         string `json:"type"`
	Name         string `json:"name"`
	Status       string `json:"status"`
	Enabled      *bool  `json:"enabled"`
	Description  string `json:"description"`
	Capabilities struct {
		Tools bool `json:"tools"`
	} `json:"capabilities"`
}

type ModelResponse struct {
	Data []Model `json:"data"`
}

type Provider struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type ProviderResponse struct {
	Data []Provider `json:"data"`
}

type SessionModel struct {
	ProviderID string `json:"providerID"`
	ID         string `json:"id"`
}

type Session struct {
	ID string `json:"id"`
}

type SessionResponse struct {
	Data Session `json:"data"`
}

type PermissionSource struct {
	Type      string `json:"type"`
	MessageID string `json:"messageID"`
	ID        string `json:"id"`
}

// PermissionRequest is the wire shape behind an approval card. Source points
// back at the tool call so a request can update the same card that will later
// report success or failure.
type PermissionRequest struct {
	ID        string           `json:"id"`
	SessionID string           `json:"sessionID"`
	Action    string           `json:"action"`
	Resources []string         `json:"resources"`
	Source    PermissionSource `json:"source"`
	Message   string           `json:"message"`
}

type Event struct {
	Type string         `json:"type"`
	Data map[string]any `json:"data"`
}
