import { type ExtensionThemeSyntaxStyle } from "../../../shared/extensions";
import {
  createDefaultCaptureEntries,
  createMonacoTokenRulesFromCaptures,
  type SyntaxEntry,
  type SyntaxStyle,
} from "./captureRegistry";
import { type ThemeTokenMap } from "./types";

export type { SyntaxEntry, SyntaxStyle };

export class AxonSyntaxTheme {
  private readonly entries: SyntaxEntry[];

  constructor(entries: SyntaxEntry[]) {
    this.entries = entries;
  }

  merge(entries: SyntaxEntry[]) {
    return new AxonSyntaxTheme([...this.entries, ...entries]);
  }

  toMonacoRules() {
    // Axon themes now treat Zed-compatible syntax captures as the stable color
    // language. Monaco token names are generated output, not the design API.
    // That distinction matters because Monaco, LSP semantic tokens, and future
    // Tree-sitter captures all name syntax differently; keeping the capture
    // layer in the middle lets Axon get richer coloring without hard-coding
    // every language directly into each theme.
    return createMonacoTokenRulesFromCaptures(this.entries);
  }
}

export function createAxonSyntaxTheme(tokens: ThemeTokenMap) {
  return new AxonSyntaxTheme(createDefaultCaptureEntries(tokens));
}

export function createExtensionSyntaxThemeEntries(
  syntax: Record<string, ExtensionThemeSyntaxStyle>,
): SyntaxEntry[] {
  return Object.entries(syntax)
    .filter(([, style]) => Object.keys(style).length > 0)
    .map(([captureName, style]) => [
      captureName,
      {
        color: style.color,
        fontStyle: style.fontStyle,
        fontWeight: style.fontWeight ?? undefined,
        backgroundColor: style.backgroundColor,
        underline: style.underline,
        strikethrough: style.strikethrough,
      },
    ]);
}
