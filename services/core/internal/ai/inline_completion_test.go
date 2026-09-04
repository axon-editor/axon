package ai

import (
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
