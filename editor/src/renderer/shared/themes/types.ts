import { type editor } from "monaco-editor";
import { type BuiltInThemeId, type ThemeColorToken } from "../../../shared/settings";
import { type ExtensionThemeSyntaxStyle } from "../../../shared/extensions";
import {
  AxonSyntaxTheme,
  createAxonSyntaxTheme,
  createExtensionSyntaxThemeEntries,
} from "./syntaxTheme";

export type ThemeTokenMap = Record<ThemeColorToken, string>;

export interface AxonThemeDefinition {
  id: BuiltInThemeId;
  label: string;
  base: editor.BuiltinTheme;
  tokens: ThemeTokenMap;
  monacoColors: editor.IColors;
  tokenRules?: editor.ITokenThemeRule[];
  semanticTokenColors?: Record<string, unknown>;
}

export function hexToMonaco(color: string) {
  return color.replace(/^#/, "").slice(0, 6);
}

export function createSyntaxRules(tokens: ThemeTokenMap): editor.ITokenThemeRule[] {
  // Axon mirrors Zed's SyntaxTheme idea here: themes define a small set of
  // semantic capture names such as function.method, property, type, and
  // punctuation.bracket, then the adapter expands those captures to Monaco's
  // language-specific token names. Keeping the capture system separate prevents
  // the editor from becoming a pile of one-off CSS overrides.
  return createAxonSyntaxTheme(tokens).toMonacoRules();
}

export function createSemanticTokenColors(tokens: ThemeTokenMap) {
  // LSP semantic tokens are the reliable path for Axon's editor feel:
  // functions, methods, classes, interfaces, properties, and parameters should
  // keep distinct colors even when a language tokenizer emits broad Monaco
  // classes. These selectors map the LSP semantic vocabulary back to Axon's
  // theme tokens so TypeScript, TSX, Go, Rust, Python, and C++ can share the
  // same visual language.
  return {
    function: tokens["syntax.function"],
    "function.declaration": tokens["syntax.function"],
    method: tokens["syntax.method"],
    "method.declaration": tokens["syntax.method"],
    class: tokens["syntax.class"],
    "class.declaration": tokens["syntax.class"],
    interface: tokens["syntax.interface"],
    "interface.declaration": tokens["syntax.interface"],
    type: tokens["syntax.type"],
    typeParameter: tokens["syntax.type"],
    enum: tokens["syntax.type"],
    namespace: tokens["syntax.type"],
    parameter: tokens["syntax.parameter"],
    variable: tokens["syntax.variable"],
    "variable.readonly": tokens["syntax.constant"],
    property: tokens["syntax.property"],
    "property.readonly": tokens["syntax.constant"],
    enumMember: tokens["syntax.constant"],
    decorator: tokens["syntax.attribute"],
    event: tokens["syntax.method"],
    macro: tokens["syntax.function"],
    constructor: tokens["syntax.class"],
    keyword: tokens["syntax.keyword"],
    "keyword.import": tokens["syntax.import"],
    comment: tokens["syntax.comment"],
    string: tokens["syntax.string"],
    number: tokens["syntax.number"],
    regexp: tokens["syntax.constant"],
    operator: tokens["syntax.operator"],
  } satisfies Record<string, string>;
}

export function createExtensionSyntaxRules(
  syntax: Record<string, ExtensionThemeSyntaxStyle>,
): editor.ITokenThemeRule[] {
  return new AxonSyntaxTheme(createExtensionSyntaxThemeEntries(syntax))
    .toMonacoRules();
}
