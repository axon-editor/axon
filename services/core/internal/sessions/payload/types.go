// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package payload

import "time"

// Meta is the session header shared by both surfaces.
type Meta struct {
	ID               string
	Title            string
	Model            string
	Provider         string
	BackendSessionID string
	Action           string
	CreatedAt        time.Time
	UpdatedAt        time.Time
	Pinned           bool
}

// toolData mirrors components.Tool so a CLI tool card can live inside the
// editor timeline without either package importing the other.
type toolData struct {
	CallID     string `json:"callId"`
	Name       string `json:"name"`
	Arguments  string `json:"arguments,omitempty"`
	Result     string `json:"result,omitempty"`
	OK         bool   `json:"ok,omitempty"`
	Running    bool   `json:"running,omitempty"`
	Waiting    bool   `json:"waiting,omitempty"`
	Approval   string `json:"approval,omitempty"`
	Expanded   bool   `json:"expanded,omitempty"`
	DurationMS int64  `json:"durationMs,omitempty"`
}

type editorConversation struct {
	ID               string          `json:"id"`
	Title            string          `json:"title"`
	CreatedAt        int64           `json:"createdAt"`
	UpdatedAt        int64           `json:"updatedAt"`
	Pinned           bool            `json:"pinned"`
	Action           string          `json:"action"`
	Messages         []editorMessage `json:"messages"`
	BackendSessionID string          `json:"backendSessionId,omitempty"`
}

type editorMessage struct {
	ID        int              `json:"id"`
	Role      string           `json:"role"`
	Content   string           `json:"content"`
	Timeline  []editorEntry    `json:"timeline,omitempty"`
	ToolCalls []editorToolCall `json:"toolCalls,omitempty"`
}

type editorEntry struct {
	ID      string      `json:"id"`
	Kind    string      `json:"kind"`
	Content string      `json:"content,omitempty"`
	Label   string      `json:"label,omitempty"`
	Tool    *editorTool `json:"tool,omitempty"`
}

type editorTool struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	Kind      string         `json:"kind"`
	Title     string         `json:"title"`
	Arguments map[string]any `json:"arguments"`
	Status    string         `json:"status"`
	Message   string         `json:"message,omitempty"`
	Result    string         `json:"result,omitempty"`
	// CLI-specific view state. The editor keeps unknown tool fields when it
	// round-trips the payload, so a CLI resume can restore approvals and
	// expanded output without a second schema.
	Approval string `json:"approval,omitempty"`
	Expanded bool   `json:"expanded,omitempty"`
}

type editorToolCall struct {
	Function struct {
		Name      string         `json:"name"`
		Arguments map[string]any `json:"arguments"`
	} `json:"function"`
}
