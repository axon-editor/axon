// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCleanInlineCompletionStripsCodeFence(t *testing.T) {
	request := InlineCompletionRequest{Prefix: "const value ="}

	got := CleanInlineCompletion("```ts\n computeValue()\n```", request)

	if got != " computeValue()" {
		t.Fatalf("expected fenced code to be stripped, got %q", got)
	}
}

func TestCleanInlineCompletionRejectsExplanatoryProse(t *testing.T) {
	request := InlineCompletionRequest{Prefix: "const value ="}

	got := CleanInlineCompletion("Here is the completion: computeValue()", request)

	if got != "" {
		t.Fatalf("expected prose completion to be rejected, got %q", got)
	}
}

func TestCleanInlineCompletionRemovesEchoedCurrentLinePrefix(t *testing.T) {
	request := InlineCompletionRequest{Prefix: "function load() {\n  return"}

	got := CleanInlineCompletion("  return fetchConfig()", request)

	if got != " fetchConfig()" {
		t.Fatalf("expected echoed current line to be removed, got %q", got)
	}
}

func TestCleanInlineCompletionRejectsSuffixDuplicate(t *testing.T) {
	request := InlineCompletionRequest{
		Prefix: "const value =",
		Suffix: " computeValue();",
	}

	got := CleanInlineCompletion(" computeValue()", request)

	if got != "" {
		t.Fatalf("expected duplicated suffix completion to be rejected, got %q", got)
	}
}

func TestCleanInlineCompletionCapsOversizedOutput(t *testing.T) {
	request := InlineCompletionRequest{Prefix: "const value ="}
	longCompletion := strings.Join([]string{
		" first()",
		"second()",
		"third()",
		"fourth()",
		"fifth()",
		"sixth()",
		"seventh()",
	}, "\n")

	got := CleanInlineCompletion(longCompletion, request)

	if strings.Count(got, "\n") != maxInlineCompletionLines-1 {
		t.Fatalf("expected completion to be capped to %d lines, got %q", maxInlineCompletionLines, got)
	}
}

func TestInlineCompletionPayloadDisablesThinking(t *testing.T) {
	var captured map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/chat" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewDecoder(r.Body).Decode(&captured)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"message":{"content":" done()"}}`))
	}))
	t.Cleanup(server.Close)
	t.Setenv("AXON_MODELS_URL", server.URL)

	response, err := callInlineCompletionModel(context.Background(), InlineCompletionRequest{
		FilePath:   "main.go",
		LanguageID: "go",
		Prefix:     "func main() {",
		Line:       1,
		Column:     1,
	})
	if err != nil {
		t.Fatalf("callInlineCompletionModel returned error: %v", err)
	}
	if response.Message.Content != " done()" {
		t.Fatalf("content = %q, want %q", response.Message.Content, " done()")
	}
	if captured["think"] != modelThink {
		t.Fatalf("think = %#v, want %t", captured["think"], modelThink)
	}
}
