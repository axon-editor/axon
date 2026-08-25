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
import { ayuSyntaxByThemeId } from "./ayuSyntax";
import { createExtensionSyntaxThemeEntries } from "./syntaxTheme";
import { resolveHighlightCapture } from "../../../services/lsp/renderer/semanticTokenDecorations";

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
});
