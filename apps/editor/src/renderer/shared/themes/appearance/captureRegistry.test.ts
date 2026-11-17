/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.defineProperty(document, "queryCommandSupported", {
    configurable: true,
    value: () => false,
  });
});

import {
  createLayeredCaptureStyleMap,
  createMonacoTokenRulesFromCaptures,
  resolveCaptureStyle,
} from "./captureRegistry";
import { ayuSyntaxByThemeId } from "../syntax/ayuSyntax";
import { createExtensionSyntaxThemeEntries } from "../syntax/syntaxTheme";
import { resolveHighlightCapture } from "../../../../services/lsp/renderer/semanticTokens/decorations/semanticTokenDecorations";

describe("createLayeredCaptureStyleMap", () => {
  it("lets an authored parent replace a more specific fallback style", () => {
    const styles = createLayeredCaptureStyleMap([
      [
        ["primary", { color: "#cccccc" }],
        ["keyword", { color: "#aa0000", fontStyle: "italic" }],
        ["keyword.control", { color: "#aa0000", fontStyle: "italic" }],
      ],
      [
        ["primary", { color: "#bbbbbb" }],
        ["keyword", { color: "#ff8800" }],
      ],
    ]);

    expect(resolveCaptureStyle("keyword.control", styles)?.style).toEqual({
      color: "#ff8800",
    });

    const rule = createMonacoTokenRulesFromCaptures(styles).find(
      (candidate) => candidate.token === "keyword.control.go",
    );
    expect(rule).toMatchObject({ foreground: "ff8800" });
    expect(rule?.fontStyle).toBeUndefined();
  });

  it("keeps a fallback capture when no stronger theme capture exists", () => {
    const styles = createLayeredCaptureStyleMap([
      [["property", { color: "#00aaff" }]],
      [["keyword", { color: "#ff8800" }]],
    ]);

    expect(resolveCaptureStyle("property", styles)?.style).toEqual({
      color: "#00aaff",
    });
  });

  it("preserves property inheritance inside the active theme", () => {
    const styles = createLayeredCaptureStyleMap([
      createExtensionSyntaxThemeEntries({
        function: { color: "#ff8800", fontStyle: "italic" },
        "function.method": { color: "#00aaff" },
      }),
    ]);

    expect(resolveCaptureStyle("function.method.call", styles)?.style).toEqual({
      color: "#00aaff",
      fontStyle: "italic",
    });
  });

  it("keeps Ayu Go namespaces neutral and qualified types cyan", () => {
    const styles = createLayeredCaptureStyleMap([
      [
        ["primary", { color: "#cccccc" }],
        ["namespace", { color: "#00aaff" }],
        ["type", { color: "#00aaff" }],
      ],
      createExtensionSyntaxThemeEntries(ayuSyntaxByThemeId["ayu-dark"]),
    ]);

    const baseToken = {
      line: 0,
      character: 0,
      length: 4,
      modifiers: [],
      source: "textmate" as const,
      languageId: "go",
    };

    expect(
      resolveHighlightCapture(
        {
          ...baseToken,
          tokenType: "namespace",
          captureCandidates: ["namespace", "module"],
        },
        styles,
      )?.style.color,
    ).toBe("#bfbdb6ff");
    expect(
      resolveHighlightCapture(
        {
          ...baseToken,
          tokenType: "type",
          captureCandidates: ["type:go", "type"],
        },
        styles,
      )?.style.color,
    ).toBe("#59c2ffff");
  });

  it("resolves language-qualified captures to their real capture", () => {
    const styles = createLayeredCaptureStyleMap([
      createExtensionSyntaxThemeEntries({
        variable: { color: "#e8e8e8" },
        "variable.parameter": { color: "#d6b0ff" },
      }),
    ]);

    const resolved = resolveCaptureStyle("variable.parameter:typescript", styles);
    expect(resolved?.capture).toBe("variable.parameter");
    expect(resolved?.style.color).toBe("#d6b0ff");
  });

  it("prefers a named capture over a weaker inherited sibling", () => {
    const styles = createLayeredCaptureStyleMap([
      createExtensionSyntaxThemeEntries({
        tag: { color: "#67d8ef" },
        attribute: { color: "#e8c76a" },
      }),
    ]);

    expect(
      resolveHighlightCapture(
        {
          line: 0,
          character: 0,
          length: 5,
          tokenType: "attribute",
          modifiers: [],
          // `tag.attribute` inherits `tag`, so without an exact-name pass it
          // would paint HTML attributes as tags and never reach `attribute`.
          captureCandidates: ["tag.attribute", "attribute"],
          source: "textmate",
          languageId: "html",
        },
        styles,
      )?.style.color,
    ).toBe("#e8c76a");
  });

  it("keeps LSP method and parameter captures specific", () => {
    const styles = createLayeredCaptureStyleMap([
      createExtensionSyntaxThemeEntries({
        function: { color: "#e8c76a" },
        "function.method": { color: "#70d6c6" },
        variable: { color: "#e8e8e8" },
        "variable.parameter": { color: "#d6b0ff" },
      }),
    ]);

    const baseToken = {
      line: 0,
      character: 0,
      length: 3,
      modifiers: [],
      source: "lsp" as const,
      languageId: "typescript",
    };

    expect(
      resolveHighlightCapture(
        {
          ...baseToken,
          tokenType: "method",
          captureCandidates: [
            "function.method:typescript",
            "function.method",
            "function:typescript",
            "function",
          ],
        },
        styles,
      )?.style.color,
    ).toBe("#70d6c6");

    expect(
      resolveHighlightCapture(
        {
          ...baseToken,
          tokenType: "parameter",
          captureCandidates: [
            "variable.parameter:typescript",
            "variable.parameter",
            "parameter:typescript",
            "parameter",
            "variable:typescript",
            "variable",
          ],
        },
        styles,
      )?.style.color,
    ).toBe("#d6b0ff");
  });
});
