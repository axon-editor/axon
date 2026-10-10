// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

// Package wire implements the Jupyter messaging framing: the multipart layout,
// the <IDS|MSG> delimiter, and the HMAC signature that authenticates each message.
// It has no ZMQ or process dependencies so the framing rules stay unit testable
// in isolation from the sockets that carry them.
package wire

import (
	"encoding/json"
	"time"
)

// Delimiter separates the routing identities from the signed message payload.
// Everything before it is transport routing (topics, socket identities) and is
// never signed; everything after it is the canonical message and is.
const Delimiter = "<IDS|MSG>"

// Message is the canonical Jupyter message after the delimiter. Identities and
// buffers ride along the wire but sit outside the signed region.
type Message struct {
	Identities   [][]byte
	Header       Header
	ParentHeader json.RawMessage
	Metadata     json.RawMessage
	Content      json.RawMessage
	Buffers      [][]byte
}

// Header is the Jupyter message header. Date marshals as RFC3339 with nanoseconds
// through Go's default time encoding, which jupyter_client parses without a custom
// format string.
type Header struct {
	MsgID    string    `json:"msg_id"`
	Username string    `json:"username"`
	Session  string    `json:"session"`
	Date     time.Time `json:"date"`
	MsgType  string    `json:"msg_type"`
	Version  string    `json:"version"`
}

// ProtocolVersion is the Jupyter messaging version this host speaks.
const ProtocolVersion = "5.3"

// ParentMsgID extracts the msg_id from a parent header so a reply or an iopub
// message can be correlated with the request that caused it. A missing or
// malformed parent returns an empty string rather than an error because some
// kernel messages legitimately have no parent.
func ParentMsgID(parent json.RawMessage) string {
	if len(parent) == 0 {
		return ""
	}
	var header struct {
		MsgID string `json:"msg_id"`
	}
	if err := json.Unmarshal(parent, &header); err != nil {
		return ""
	}
	return header.MsgID
}

// Message type constants for the channels this host uses. Keeping them named
// avoids typo drift between the sender and the switch that routes replies.
const (
	// Shell channel: requests and their replies.
	MsgKernelInfoRequest = "kernel_info_request"
	MsgKernelInfoReply   = "kernel_info_reply"
	MsgExecuteRequest    = "execute_request"
	MsgExecuteReply      = "execute_reply"
	MsgInterruptRequest  = "interrupt_request"
	MsgInterruptReply    = "interrupt_reply"
	MsgShutdownRequest   = "shutdown_request"
	MsgShutdownReply     = "shutdown_reply"

	// Control channel: out-of-band kernel management.
	MsgControlInterruptRequest = "interrupt_request"
	MsgControlShutdownRequest  = "shutdown_request"

	// IOPub channel: asynchronous kernel output.
	MsgStatus        = "status"
	MsgStream        = "stream"
	MsgExecuteInput  = "execute_input"
	MsgExecuteResult = "execute_result"
	MsgDisplayData   = "display_data"
	MsgUpdateDisplay = "update_display_data"
	MsgError         = "error"
	MsgClearOutput   = "clear_output"
)
