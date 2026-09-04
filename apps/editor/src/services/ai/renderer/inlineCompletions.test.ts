import { describe, expect, it } from "vitest";
import * as monaco from "monaco-editor";
import {
  normalizeInlineCompletionText,
  shouldRequestInlineAiCompletion,
} from "./inlineCompletions";

describe("inline AI completions", () => {
  it("allows explicit inline completion requests even for short prefixes", () => {
    expect(
      shouldRequestInlineAiCompletion({
        linePrefix: "x",
        context: {
          triggerKind: monaco.languages.InlineCompletionTriggerKind.Explicit,
          selectedSuggestionInfo: undefined,
          includeInlineCompletions: true,
        },
      }),
    ).toBe(true);
  });

  it("blocks automatic requests when Monaco is already showing selected suggestions", () => {
    expect(
      shouldRequestInlineAiCompletion({
        linePrefix: "const value",
        context: {
          triggerKind: monaco.languages.InlineCompletionTriggerKind.Automatic,
          selectedSuggestionInfo: {} as monaco.languages.SelectedSuggestionInfo,
          includeInlineCompletions: true,
        },
      }),
    ).toBe(false);
  });

  it("normalizes CRLF completions before Monaco receives them", () => {
    expect(
      normalizeInlineCompletionText({
        completion: "foo\r\nbar",
        lineSuffix: "",
      }),
    ).toBe("foo\nbar");
  });

  it("rejects multiline completions in the middle of existing code", () => {
    expect(
      normalizeInlineCompletionText({
        completion: "foo\nbar",
        lineSuffix: ");",
      }),
    ).toBe("");
  });
});
