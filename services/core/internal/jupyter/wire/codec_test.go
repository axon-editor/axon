// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package wire

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"testing"
	"time"
)

func sampleMessage(t *testing.T) Message {
	t.Helper()
	content, err := json.Marshal(map[string]any{"code": "print(1)"})
	if err != nil {
		t.Fatalf("marshal content: %v", err)
	}
	return Message{
		Identities: [][]byte{[]byte("topic"), []byte("identity")},
		Header: Header{
			MsgID:    "msg-1",
			Username: "axon",
			Session:  "session-1",
			Date:     time.Unix(0, 0).UTC(),
			MsgType:  MsgExecuteRequest,
			Version:  ProtocolVersion,
		},
		Content: content,
	}
}

func TestCodecRoundTrip(t *testing.T) {
	codec := NewCodec("secret-key")
	original := sampleMessage(t)

	frames, err := codec.Encode(original)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	if string(frames[len(original.Identities)]) != Delimiter {
		t.Fatalf("delimiter not placed after identities: %q", frames[len(original.Identities)])
	}

	decoded, err := codec.Decode(frames)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if decoded.Header.MsgID != original.Header.MsgID || decoded.Header.MsgType != original.Header.MsgType {
		t.Fatalf("header mismatch: %+v", decoded.Header)
	}
	if string(decoded.Identities[1]) != "identity" {
		t.Fatalf("identities mismatch: %q", decoded.Identities)
	}
	var content map[string]any
	if err := json.Unmarshal(decoded.Content, &content); err != nil {
		t.Fatalf("decode content: %v", err)
	}
	if content["code"] != "print(1)" {
		t.Fatalf("content mismatch: %+v", content)
	}
	if string(decoded.ParentHeader) != "{}" {
		t.Fatalf("expected empty parent object, got %s", decoded.ParentHeader)
	}
}

func TestCodecSignatureMatchesReference(t *testing.T) {
	// A hand-computed signature pins the signed region and its order. If someone
	// reorders the parts or signs a different set of frames this check fails even
	// though a self round-trip would still pass.
	codec := NewCodec("secret-key")
	original := sampleMessage(t)
	frames, err := codec.Encode(original)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	mac := hmac.New(sha256.New, []byte("secret-key"))
	for _, frame := range frames[len(original.Identities)+2 : len(original.Identities)+6] {
		mac.Write(frame)
	}
	expected := hex.EncodeToString(mac.Sum(nil))
	if got := string(frames[len(original.Identities)+1]); got != expected {
		t.Fatalf("signature mismatch: got %s want %s", got, expected)
	}
}

func TestCodecRejectsWrongKey(t *testing.T) {
	frames, err := NewCodec("right-key").Encode(sampleMessage(t))
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	if _, err := NewCodec("wrong-key").Decode(frames); !errors.Is(err, ErrBadSignature) {
		t.Fatalf("expected ErrBadSignature, got %v", err)
	}
}

func TestCodecRejectsMissingDelimiter(t *testing.T) {
	_, err := NewCodec("key").Decode([][]byte{[]byte("a"), []byte("b")})
	if !errors.Is(err, ErrMissingDelimiter) {
		t.Fatalf("expected ErrMissingDelimiter, got %v", err)
	}
}

func TestParentMsgID(t *testing.T) {
	parent, err := json.Marshal(Header{MsgID: "parent-1"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if got := ParentMsgID(parent); got != "parent-1" {
		t.Fatalf("ParentMsgID = %q", got)
	}
	if got := ParentMsgID(nil); got != "" {
		t.Fatalf("ParentMsgID(nil) = %q", got)
	}
	if got := ParentMsgID(json.RawMessage("not-json")); got != "" {
		t.Fatalf("ParentMsgID(invalid) = %q", got)
	}
}
