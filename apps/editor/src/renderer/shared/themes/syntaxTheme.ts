import { type ExtensionThemeSyntaxStyle } from "../../../shared/extensions";
import {
  createLayeredCaptureStyleMap,
  createDefaultCaptureEntries,
  createMonacoTokenRulesFromCaptures,
  type SyntaxEntry,
  type SyntaxStyle,
} from "./captureRegistry";
import { type ThemeTokenMap } from "./types";

export type { SyntaxEntry, SyntaxStyle };

export class AxonSyntaxTheme {
  private readonly layers: SyntaxEntry[][];

  constructor(layers: SyntaxEntry[][]) {
    this.layers = layers;
  }

  merge(entries: SyntaxEntry[]) {
    return new AxonSyntaxTheme([...this.layers, entries]);
  }

  toMonacoRules() {
    // Axon themes now treat Zed-compatible syntax captures as the stable color
    // language. Monaco token names are generated output, not the design API.
    // That distinction matters because Monaco, LSP semantic tokens, and future
    // Tree-sitter captures all name syntax differently; keeping the capture
    // layer in the middle lets Axon get richer coloring without hard-coding
    // every language directly into each theme.
    return createMonacoTokenRulesFromCaptures(
      createLayeredCaptureStyleMap(this.layers),
    );
  }
}

export function createAxonSyntaxTheme(tokens: ThemeTokenMap) {
  return new AxonSyntaxTheme([createDefaultCaptureEntries(tokens)]);
}

export function createExtensionSyntaxThemeEntries(
  syntax: Record<string, ExtensionThemeSyntaxStyle>,
): SyntaxEntry[] {
  return Object.entries(syntax)
    .filter(([, style]) => Object.keys(style).length > 0)
    .map(([captureName, style]) => {
      const entry: SyntaxStyle = {};
      if (style.color !== undefined) entry.color = style.color;
      if (style.fontStyle !== undefined) entry.fontStyle = style.fontStyle;
      if (style.fontWeight !== undefined && style.fontWeight !== null) {
        entry.fontWeight = style.fontWeight;
      }
      if (style.backgroundColor !== undefined) {
        entry.backgroundColor = style.backgroundColor;
      }
      if (style.underline !== undefined) entry.underline = style.underline;
      if (style.strikethrough !== undefined) {
        entry.strikethrough = style.strikethrough;
      }
      return [captureName, entry];
    });
}
