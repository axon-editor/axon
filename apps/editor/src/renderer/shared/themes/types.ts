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
  semanticTokenColors?: Record<string, unknown>;
}

export function hexToMonaco(color: string) {
  return color.replace(/^#/, "").slice(0, 6);
}

export function createSyntaxRules(
  tokens: ThemeTokenMap,
  syntax: Record<string, ExtensionThemeSyntaxStyle> = {},
): editor.ITokenThemeRule[] {
  // Axon mirrors Zed's SyntaxTheme idea here: themes define a small set of
  // semantic capture names such as function.method, property, type, and
  // punctuation.bracket, then the adapter expands those captures to Monaco's
  // language-specific token names. Keeping the capture system separate prevents
  // the editor from becoming a pile of one-off CSS overrides.
  //
  // Base captures and extension captures are merged before generating Monaco
  // rules. That matters because Zed themes often define `primary` as the prose
  // fallback; if extension rules were emitted in a separate pass, `primary`
  // could repaint otherwise well-classified tokens back to foreground.
  return createAxonSyntaxTheme(tokens)
    .merge(createExtensionSyntaxThemeEntries(syntax))
    .toMonacoRules();
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
    "function.defaultLibrary": tokens["syntax.function"],
    method: tokens["syntax.method"],
    "method.declaration": tokens["syntax.method"],
    "method.defaultLibrary": tokens["syntax.method"],
    class: tokens["syntax.class"],
    "class.declaration": tokens["syntax.class"],
    "class.defaultLibrary": tokens["syntax.class"],
    interface: tokens["syntax.interface"],
    "interface.declaration": tokens["syntax.interface"],
    type: tokens["syntax.type"],
    "type.declaration": tokens["syntax.type"],
    typeParameter: tokens["syntax.type"],
    "typeParameter.declaration": tokens["syntax.type"],
    enum: tokens["syntax.type"],
    "enum.declaration": tokens["syntax.type"],
    namespace: tokens["syntax.type"],
    "namespace.declaration": tokens["syntax.type"],
    parameter: tokens["syntax.parameter"],
    "parameter.declaration": tokens["syntax.parameter"],
    variable: tokens["syntax.variable"],
    "variable.readonly": tokens["syntax.constant"],
    "variable.defaultLibrary": tokens["syntax.constant"],
    "variable.local": tokens["syntax.variable"],
    property: tokens["syntax.property"],
    "property.declaration": tokens["syntax.property"],
    "property.readonly": tokens["syntax.constant"],
    "property.defaultLibrary": tokens["syntax.property"],
    enumMember: tokens["syntax.constant"],
    "enumMember.readonly": tokens["syntax.constant"],
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
