// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/GordenArcher/axon-core/internal/sessions"
)

func TestSessionsWorkspaceRoundTrip(t *testing.T) {
	store, err := sessions.OpenAt(filepath.Join(t.TempDir(), "sessions.db"))
	if err != nil {
		t.Fatalf("open session store: %v", err)
	}
	t.Cleanup(func() {
		_ = store.Close()
	})
	server := New("token", store)

	first := json.RawMessage(`{
		"id":"c1",
		"title":"First conversation",
		"createdAt":1000,
		"updatedAt":2000,
		"pinned":true,
		"action":"agent",
		"messages":[{"id":1,"role":"user","content":"hello"}]
	}`)
	second := json.RawMessage(`{
		"id":"c2",
		"title":"Second conversation",
		"createdAt":3000,
		"updatedAt":4000,
		"pinned":false,
		"action":"agent",
		"messages":[]
	}`)

	body, err := json.Marshal(sessionsWorkspaceRequest{
		FolderPath:    stringPointer("/tmp/axon"),
		ActiveID:      "c2",
		Conversations: []json.RawMessage{first, second},
	})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	save := httptest.NewRequest(
		http.MethodPost,
		"/sessions/workspace",
		bytes.NewReader(body),
	)
	saveRecorder := httptest.NewRecorder()
	server.handleSessionsWorkspace(saveRecorder, save)
	if saveRecorder.Code != http.StatusOK {
		t.Fatalf("save status = %d: %s", saveRecorder.Code, saveRecorder.Body.String())
	}

	load := httptest.NewRequest(
		http.MethodGet,
		"/sessions/workspace?path=%2Ftmp%2Faxon",
		nil,
	)
	loadRecorder := httptest.NewRecorder()
	server.handleSessionsWorkspace(loadRecorder, load)
	if loadRecorder.Code != http.StatusOK {
		t.Fatalf("load status = %d: %s", loadRecorder.Code, loadRecorder.Body.String())
	}

	var envelope struct {
		Status string `json:"status"`
		Data   struct {
			ActiveID      string            `json:"activeId"`
			Conversations []json.RawMessage `json:"conversations"`
		} `json:"data"`
	}
	if err := json.NewDecoder(loadRecorder.Body).Decode(&envelope); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if envelope.Status != "success" {
		t.Fatalf("status = %q", envelope.Status)
	}
	if envelope.Data.ActiveID != "c2" {
		t.Fatalf("active id = %q", envelope.Data.ActiveID)
	}
	if len(envelope.Data.Conversations) != 2 {
		t.Fatalf("conversations = %d", len(envelope.Data.Conversations))
	}
}

func stringPointer(value string) *string {
	return &value
}
