// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package kernelhost

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"
)

func issueTicket(t *testing.T, host *Server, body map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	payload, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/kernel/ticket", bytes.NewReader(payload))
	request.Header.Set("Authorization", "Bearer test-token")
	recorder := httptest.NewRecorder()
	host.ControlRouter().ServeHTTP(recorder, request)
	return recorder
}

func TestTicketIssuanceAndConsumption(t *testing.T) {
	workspace := t.TempDir()
	notebook := filepath.Join(workspace, "analysis.ipynb")

	host := New("test-token")
	recorder := issueTicket(t, host, map[string]string{
		"sessionId":     "session-1",
		"cwd":           workspace,
		"workspaceRoot": workspace,
		"notebookPath":  notebook,
		"kernelName":    "python3",
	})
	if recorder.Code != http.StatusOK {
		t.Fatalf("ticket request status = %d body=%s", recorder.Code, recorder.Body.String())
	}
	var payload struct {
		Status string            `json:"status"`
		Data   map[string]string `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode ticket payload: %v", err)
	}
	if payload.Status != "ok" || payload.Data["ticket"] == "" {
		t.Fatalf("unexpected ticket payload: %s", recorder.Body.String())
	}

	spec, ok := host.consumeTicket("session-1", payload.Data["ticket"])
	if !ok {
		t.Fatal("ticket was not consumable")
	}
	wantCwd, _ := resolvePathTarget(workspace)
	wantNotebook, _ := resolvePathTarget(notebook)
	if spec.NotebookPath != wantNotebook || spec.Cwd != wantCwd {
		t.Fatalf("ticket spec mismatch: got %+v want cwd=%s notebook=%s", spec, wantCwd, wantNotebook)
	}
	if _, reused := host.consumeTicket("session-1", payload.Data["ticket"]); reused {
		t.Fatal("ticket was reusable; capabilities must be single use")
	}
	if _, wrongSession := host.consumeTicket("other-session", payload.Data["ticket"]); wrongSession {
		t.Fatal("ticket was accepted for a different session")
	}
}

func TestTicketRejectsNotebookOutsideWorkspace(t *testing.T) {
	workspace := t.TempDir()
	outside := t.TempDir()

	host := New("test-token")
	recorder := issueTicket(t, host, map[string]string{
		"sessionId":     "session-1",
		"cwd":           workspace,
		"workspaceRoot": workspace,
		"notebookPath":  filepath.Join(outside, "escape.ipynb"),
	})
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for out-of-workspace notebook, got %d", recorder.Code)
	}
}

func TestControlRouterRequiresBearer(t *testing.T) {
	host := New("test-token")
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	recorder := httptest.NewRecorder()
	host.ControlRouter().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without bearer, got %d", recorder.Code)
	}
}

func TestTicketIsSingleUse(t *testing.T) {
	workspace := t.TempDir()
	host := New("test-token")
	recorder := issueTicket(t, host, map[string]string{
		"sessionId":     "session-1",
		"cwd":           workspace,
		"workspaceRoot": workspace,
		"notebookPath":  filepath.Join(workspace, "n.ipynb"),
	})
	var payload struct {
		Data map[string]string `json:"data"`
	}
	_ = json.Unmarshal(recorder.Body.Bytes(), &payload)
	if _, ok := host.consumeTicket("session-1", payload.Data["ticket"]); !ok {
		t.Fatal("first consumption failed")
	}
	if _, ok := host.consumeTicket("session-1", payload.Data["ticket"]); ok {
		t.Fatal("second consumption succeeded")
	}
}

func TestTicketExpiryIsBounded(t *testing.T) {
	if ticketTTL > time.Minute {
		t.Fatalf("ticket TTL of %s is too permissive", ticketTTL)
	}
}

func TestPathInsideRoot(t *testing.T) {
	root := t.TempDir()
	if !pathInsideRoot(root, root) {
		t.Fatal("root should be inside itself")
	}
	if !pathInsideRoot(root, filepath.Join(root, "sub", "file.txt")) {
		t.Fatal("child path inside the root was rejected")
	}
	if pathInsideRoot(root, filepath.Join(root, "..", "escape")) {
		t.Fatal("path escaping the root was accepted")
	}
}
