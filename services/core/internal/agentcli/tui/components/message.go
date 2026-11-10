// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package components

// Message is the TUI's transcript unit. Role and text stay separate from the
// renderer so tools and approvals can add their own record types without
// reshaping the streaming client.
type Message struct {
	ID        string
	Role      string
	Content   string
	Thinking  bool
	Collapsed bool
	Tool      *Tool
}

// Tool is the transcript card for one tool call. CallID pairs the start and
// result events; the message ID is separate because a card is a transcript row.
type Tool struct {
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
