// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

// Package kernelhost owns notebook kernels for one Axon launch. It spawns
// ipykernel processes, speaks the Jupyter protocol to them over ZMQ, and bridges
// their output to the renderer over a single WebSocket per attached view. It is
// deliberately separate from ptyhost so a kernel that pins a CPU core or leaks
// memory cannot share a scheduler or restart lifecycle with interactive shells.
package kernelhost

import "encoding/json"

// Renderer to host message types.
const (
	clientExecute   = "execute"
	clientInterrupt = "interrupt"
	clientRestart   = "restart"
	clientShutdown  = "shutdown"
)

// Host to renderer message types.
const (
	serverReady = "ready"
	serverIOPub = "iopub"
	serverReply = "reply"
	serverError = "error"
	serverExit  = "exit"
)

// clientMessage is the only shape the host accepts from a renderer. id is a
// renderer-generated correlation token; the host maps it to the kernel's own
// msg_id so streamed output and the final reply can be tagged back to the cell
// that produced them.
type clientMessage struct {
	Type string `json:"type"`
	ID   string `json:"id,omitempty"`
	Code string `json:"code,omitempty"`
}

// serverMessage is the only shape the host emits. Fields are omitted when empty
// so the renderer can switch on type without null checks.
type serverMessage struct {
	Type     string          `json:"type"`
	ID       string          `json:"id,omitempty"`
	MsgType  string          `json:"msgType,omitempty"`
	Content  json.RawMessage `json:"content,omitempty"`
	Metadata json.RawMessage `json:"metadata,omitempty"`
	Message  string          `json:"message,omitempty"`
	Code     *int            `json:"code,omitempty"`
	Kernel   *kernelSummary  `json:"kernel,omitempty"`
}

// kernelSummary is what the UI needs to label the kernel before any output.
type kernelSummary struct {
	Name     string `json:"name"`
	Language string `json:"language"`
	Banner   string `json:"banner"`
}

func mustMarshal(message serverMessage) []byte {
	payload, err := json.Marshal(message)
	if err != nil {
		// Every field on serverMessage is JSON-safe, so a marshal failure means a
		// programming error rather than bad input. Falling back to a static error
		// frame keeps the socket protocol honest instead of dropping the message.
		return []byte(`{"type":"error","message":"failed to encode host message"}`)
	}
	return payload
}
