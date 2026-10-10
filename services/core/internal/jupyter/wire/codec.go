// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package wire

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
)

// ErrMissingDelimiter means the frame list did not contain the Jupyter delimiter,
// so it cannot be a valid message. Callers treat this as a protocol violation
// rather than a recoverable parse miss.
var ErrMissingDelimiter = errors.New("jupyter message is missing the <IDS|MSG> delimiter")

// ErrBadSignature means the HMAC did not match. A mismatch is always fatal: it
// proves the sender does not hold the connection key and the payload must not be
// trusted or routed.
var ErrBadSignature = errors.New("jupyter message signature did not verify")

// fieldCount is the number of frames after the delimiter that form the signed
// message: signature plus the four JSON slots. Its value is also the offset from
// the delimiter to the first binary buffer.
const fieldCount = 5

// Codec signs and verifies messages for one connection key. It is safe to share
// across goroutines because it holds only immutable key material.
type Codec struct {
	key []byte
}

// NewCodec builds a codec for a connection's HMAC key. Jupyter keys on the raw
// string bytes, so callers pass the connection file's Key value untouched.
func NewCodec(key string) Codec {
	return Codec{key: []byte(key)}
}

// emptyObject is what Jupyter expects for absent parent/metadata/content slots.
// Sending a literal null breaks kernels that index into the dict unconditionally.
var emptyObject = json.RawMessage(`{}`)

func normalize(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return emptyObject
	}
	return raw
}

func (c Codec) signature(header, parent, metadata, content json.RawMessage) string {
	// The signed region is fixed: header, parent, metadata, content in that order.
	// Reordering or omitting one would verify against nothing, so the order is a
	// hard invariant shared with jupyter_client.
	mac := hmac.New(sha256.New, c.key)
	for _, part := range [][]byte{header, parent, metadata, content} {
		mac.Write(part)
	}
	return hex.EncodeToString(mac.Sum(nil))
}

// Encode serializes a message into ZMQ frames: leading identities, the delimiter,
// the hex signature, the four JSON slots, then any binary buffers.
func (c Codec) Encode(message Message) ([][]byte, error) {
	header, err := json.Marshal(message.Header)
	if err != nil {
		return nil, err
	}
	parent := normalize(message.ParentHeader)
	metadata := normalize(message.Metadata)
	content := normalize(message.Content)
	signature := c.signature(header, parent, metadata, content)

	frames := make([][]byte, 0, len(message.Identities)+1+fieldCount+len(message.Buffers))
	frames = append(frames, message.Identities...)
	frames = append(frames, []byte(Delimiter), []byte(signature), header, parent, metadata, content)
	frames = append(frames, message.Buffers...)
	return frames, nil
}

// Decode parses and verifies a frame list. It returns ErrMissingDelimiter when the
// layout is wrong and ErrBadSignature when the HMAC does not match, so the caller
// can distinguish a framing bug from an authentication failure.
func (c Codec) Decode(frames [][]byte) (Message, error) {
	delimiterIndex := -1
	for index, frame := range frames {
		if string(frame) == Delimiter {
			delimiterIndex = index
			break
		}
	}
	if delimiterIndex < 0 {
		return Message{}, ErrMissingDelimiter
	}
	// After the delimiter come exactly five slots: signature, header, parent,
	// metadata, content. Buffers may follow but are not signed.
	if len(frames) < delimiterIndex+1+fieldCount {
		return Message{}, fmt.Errorf(
			"jupyter message has %d frames after the delimiter, expected at least %d",
			len(frames)-delimiterIndex-1, fieldCount,
		)
	}
	signature := frames[delimiterIndex+1]
	header := frames[delimiterIndex+2]
	parent := normalize(frames[delimiterIndex+3])
	metadata := normalize(frames[delimiterIndex+4])
	content := normalize(frames[delimiterIndex+5])

	expected := c.signature(header, parent, metadata, content)
	// Constant-time compare so a malicious actor cannot learn the signature byte by
	// byte from timing differences.
	if subtle.ConstantTimeCompare([]byte(expected), signature) != 1 {
		return Message{}, ErrBadSignature
	}

	var parsedHeader Header
	if err := json.Unmarshal(header, &parsedHeader); err != nil {
		return Message{}, fmt.Errorf("invalid jupyter header: %w", err)
	}

	message := Message{
		Identities:   cloneFrames(frames[:delimiterIndex]),
		Header:       parsedHeader,
		ParentHeader: parent,
		Metadata:     metadata,
		Content:      content,
	}
	if bufferCount := len(frames) - (delimiterIndex + 1 + fieldCount); bufferCount > 0 {
		message.Buffers = cloneFrames(frames[delimiterIndex+1+fieldCount:])
	}
	return message, nil
}

// cloneFrames copies a slice of frame buffers so a decoded message does not hold
// references into a socket buffer that the next receive will overwrite.
func cloneFrames(frames [][]byte) [][]byte {
	if len(frames) == 0 {
		return nil
	}
	cloned := make([][]byte, len(frames))
	for index, frame := range frames {
		cloned[index] = append([]byte(nil), frame...)
	}
	return cloned
}
