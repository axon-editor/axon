// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAIChatTurnRejectsGet(t *testing.T) {
	recorder := httptest.NewRecorder()
	New(testCoreToken).Router().ServeHTTP(
		recorder,
		authenticatedRequest(http.MethodGet, "/ai/chat/turn", nil),
	)
	if recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected turn GET to be rejected, got %d", recorder.Code)
	}
}

func TestAIToolDefinitionsReturnsProjectTools(t *testing.T) {
	recorder := httptest.NewRecorder()
	New(testCoreToken).Router().ServeHTTP(
		recorder,
		authenticatedRequest(http.MethodGet, "/ai/tool-definitions", nil),
	)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected tool definitions 200, got %d", recorder.Code)
	}

	var envelope struct {
		Data []struct {
			Function struct {
				Name string `json:"name"`
			} `json:"function"`
		} `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("failed to decode tool definitions: %v", err)
	}
	names := map[string]bool{}
	for _, tool := range envelope.Data {
		names[tool.Function.Name] = true
	}
	for _, expected := range []string{"list_files", "glob", "grep", "read_file"} {
		if !names[expected] {
			t.Fatalf("tool definitions missing %q, got %v", expected, names)
		}
	}
}

func TestAIRunToolRequiresName(t *testing.T) {
	recorder := httptest.NewRecorder()
	New(testCoreToken).Router().ServeHTTP(
		recorder,
		authenticatedRequest(http.MethodPost, "/ai/run-tool", []byte(`{"arguments":{}}`)),
	)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected missing tool name to be rejected, got %d", recorder.Code)
	}
}

func TestAIRunToolExecutesProjectTool(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "main.go"), []byte("package main\n"), 0o644); err != nil {
		t.Fatalf("failed to seed workspace file: %v", err)
	}

	body, err := json.Marshal(map[string]any{
		"folderPath": root,
		"name":       "list_files",
		"arguments":  map[string]any{"path": ""},
	})
	if err != nil {
		t.Fatalf("failed to encode run-tool request: %v", err)
	}

	recorder := httptest.NewRecorder()
	New(testCoreToken).Router().ServeHTTP(
		recorder,
		authenticatedRequest(http.MethodPost, "/ai/run-tool", body),
	)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected run-tool 200, got %d: %s", recorder.Code, recorder.Body.String())
	}

	var envelope struct {
		Data struct {
			Name   string `json:"name"`
			Result string `json:"result"`
		} `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("failed to decode run-tool response: %v", err)
	}
	if envelope.Data.Name != "list_files" {
		t.Fatalf("expected list_files result, got %q", envelope.Data.Name)
	}
	if !strings.Contains(envelope.Data.Result, "main.go") {
		t.Fatalf("list_files result should include the workspace file, got %q", envelope.Data.Result)
	}
}

func TestAIRunToolKeepsSearchInsideWorkspace(t *testing.T) {
	root := t.TempDir()
	outside := filepath.Join(t.TempDir(), "secret.txt")
	if err := os.WriteFile(outside, []byte("do-not-read\n"), 0o644); err != nil {
		t.Fatalf("failed to write outside file: %v", err)
	}

	body, err := json.Marshal(map[string]any{
		"folderPath": root,
		"name":       "read_file",
		"arguments":  map[string]string{"path": outside},
	})
	if err != nil {
		t.Fatalf("failed to marshal request: %v", err)
	}

	recorder := httptest.NewRecorder()
	New(testCoreToken).Router().ServeHTTP(
		recorder,
		authenticatedRequest(http.MethodPost, "/ai/run-tool", body),
	)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected read_file 200, got %d", recorder.Code)
	}
	if strings.Contains(recorder.Body.String(), "do-not-read") {
		t.Fatal("read_file must not read files outside the workspace")
	}
}
