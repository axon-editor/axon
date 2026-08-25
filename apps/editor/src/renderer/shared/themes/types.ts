import { type editor } from "monaco-editor";
import { type ThemeColorToken } from "../../../shared/settings";
import { type ExtensionThemeSyntaxStyle } from "../../../shared/extensions";
import {
  createAxonSyntaxTheme,
  createExtensionSyntaxThemeEntries,
} from "./syntaxTheme";

export type ThemeTokenMap = Record<ThemeColorToken, string>;

export interface AxonThemeDefinition {
  id: string;
  label: string;
  base: editor.BuiltinTheme;
  tokens: ThemeTokenMap;
  monacoColors: editor.IColors;
  tokenRules?: editor.ITokenThemeRule[];
  syntax?: Record<string, ExtensionThemeSyntaxStyle>;
}

export function hexToMonaco(color: string) {
  return color.replace(/^#/, "").slice(0, 6);
}

export function createSyntaxRules(
  tokens: ThemeTokenMap,
  syntax: Record<string, ExtensionThemeSyntaxStyle> = {},
): editor.ITokenThemeRule[] {
  // Monaco still needs lexical rules for its immediate first paint and for
  // large-document mode, where Axon deliberately skips whole-file grammar and
  // LSP work. These rules use the same capture hierarchy as the later semantic
  // decoration pass, so the baseline never introduces a second semantic color
  // contract or a theme-specific set of selectors.
  return createAxonSyntaxTheme(tokens)
    .merge(createExtensionSyntaxThemeEntries(syntax))
    .toMonacoRules();
}
