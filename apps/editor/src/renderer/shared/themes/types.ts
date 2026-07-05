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
  syntax?: Record<string, ExtensionThemeSyntaxStyle>;
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

function pickSyntaxColor(
  syntax: Record<string, ExtensionThemeSyntaxStyle>,
  captures: string[],
) {
  for (const capture of captures) {
    const color = syntax[capture]?.color;
    if (color) return color;
  }
  return null;
}

export function createSemanticTokenColors(
  tokens: ThemeTokenMap,
  syntax: Record<string, ExtensionThemeSyntaxStyle> = {},
) {
  const semanticColor = (fallback: string, ...captures: string[]) =>
    pickSyntaxColor(syntax, captures) ?? fallback;

  // LSP semantic tokens are the reliable path for Axon's editor feel:
  // functions, methods, classes, interfaces, properties, and parameters should
  // keep distinct colors even when a language tokenizer emits broad Monaco
  // classes. These selectors first resolve through the active extension
  // theme's Zed-compatible capture table, then fall back to Axon's required
  // flat tokens. Without the capture step, rich themes like Ayu lose details
  // such as constructor/type/variant/parameter color choices before Monaco or
  // the semantic decoration layer ever gets a chance to paint them.
  return {
    function: semanticColor(tokens["syntax.function"], "function"),
    "function.declaration": semanticColor(tokens["syntax.function"], "function"),
    "function.defaultLibrary": semanticColor(tokens["syntax.function"], "function.builtin", "function"),
    "function.builtin": semanticColor(tokens["syntax.function"], "function.builtin", "function"),
    "function.callable": semanticColor(tokens["syntax.function"], "function"),
    method: semanticColor(tokens["syntax.method"], "function.method", "function"),
    "method.declaration": semanticColor(tokens["syntax.method"], "function.method", "function"),
    "method.defaultLibrary": semanticColor(tokens["syntax.method"], "function.builtin", "function.method", "function"),
    "method.builtin": semanticColor(tokens["syntax.method"], "function.builtin", "function.method", "function"),
    "method.callable": semanticColor(tokens["syntax.method"], "function.method", "function"),
    constructor: semanticColor(tokens["syntax.class"], "constructor", "type.class", "type"),
    "constructor.declaration": semanticColor(tokens["syntax.class"], "constructor", "type.class", "type"),
    "constructor.defaultLibrary": semanticColor(tokens["syntax.class"], "constructor", "type.class", "type"),
    class: semanticColor(tokens["syntax.class"], "type.class", "type"),
    "class.declaration": semanticColor(tokens["syntax.class"], "type.class", "type"),
    "class.defaultLibrary": semanticColor(tokens["syntax.class"], "type.class", "type"),
    interface: semanticColor(tokens["syntax.interface"], "type.interface", "type"),
    "interface.declaration": semanticColor(tokens["syntax.interface"], "type.interface", "type"),
    trait: semanticColor(tokens["syntax.interface"], "type.interface", "type"),
    "trait.declaration": semanticColor(tokens["syntax.interface"], "type.interface", "type"),
    type: semanticColor(tokens["syntax.type"], "type"),
    "type.declaration": semanticColor(tokens["syntax.type"], "type"),
    "type.defaultLibrary": semanticColor(tokens["syntax.type"], "type.builtin", "type"),
    "type.builtin": semanticColor(tokens["syntax.type"], "type.builtin", "type"),
    typeAlias: semanticColor(tokens["syntax.type"], "type"),
    "typeAlias.declaration": semanticColor(tokens["syntax.type"], "type"),
    builtinType: semanticColor(tokens["syntax.type"], "type.builtin", "type"),
    typeParameter: semanticColor(tokens["syntax.type"], "type"),
    "typeParameter.declaration": semanticColor(tokens["syntax.type"], "type"),
    enum: semanticColor(tokens["syntax.type"], "enum", "type.enum", "type"),
    "enum.declaration": semanticColor(tokens["syntax.type"], "enum", "type.enum", "type"),
    struct: semanticColor(tokens["syntax.type"], "type.struct", "type"),
    "struct.declaration": semanticColor(tokens["syntax.type"], "type.struct", "type"),
    union: semanticColor(tokens["syntax.type"], "type"),
    "union.declaration": semanticColor(tokens["syntax.type"], "type"),
    namespace: semanticColor(tokens["syntax.type"], "namespace"),
    "namespace.declaration": semanticColor(tokens["syntax.type"], "namespace"),
    lifetime: semanticColor(tokens["syntax.type"], "label", "type"),
    parameter: semanticColor(tokens["syntax.parameter"], "variable.parameter", "variable"),
    "parameter.declaration": semanticColor(tokens["syntax.parameter"], "variable.parameter", "variable"),
    "parameter.mutable": semanticColor(tokens["syntax.parameter"], "variable.parameter", "variable.mutable", "variable"),
    variable: semanticColor(tokens["syntax.variable"], "variable"),
    "variable.readonly": semanticColor(tokens["syntax.constant"], "constant", "variable.special"),
    "variable.defaultLibrary": semanticColor(tokens["syntax.constant"], "variable.builtin", "constant"),
    "variable.local": semanticColor(tokens["syntax.variable"], "variable"),
    "variable.mutable": semanticColor(tokens["syntax.variable"], "variable.mutable", "variable"),
    "variable.constant": semanticColor(tokens["syntax.constant"], "constant", "variable.special"),
    "variable.builtin": semanticColor(tokens["syntax.constant"], "variable.builtin", "constant"),
    "variable.library": semanticColor(tokens["syntax.constant"], "variable.builtin", "constant"),
    selfKeyword: semanticColor(tokens["syntax.constant"], "variable.special", "constant"),
    property: semanticColor(tokens["syntax.property"], "property", "variable.member"),
    "property.declaration": semanticColor(tokens["syntax.property"], "property", "variable.member"),
    "property.readonly": semanticColor(tokens["syntax.constant"], "constant", "property"),
    "property.defaultLibrary": semanticColor(tokens["syntax.property"], "property", "variable.member"),
    "property.mutable": semanticColor(tokens["syntax.property"], "property", "variable.member"),
    "property.builtin": semanticColor(tokens["syntax.property"], "property", "variable.member"),
    enumMember: semanticColor(tokens["syntax.constant"], "variant", "constant"),
    "enumMember.readonly": semanticColor(tokens["syntax.constant"], "variant", "constant"),
    decorator: semanticColor(tokens["syntax.attribute"], "attribute"),
    attribute: semanticColor(tokens["syntax.attribute"], "attribute"),
    tag: semanticColor(tokens["syntax.tag"], "tag"),
    event: semanticColor(tokens["syntax.method"], "function.method", "function"),
    macro: semanticColor(tokens["syntax.function"], "function.special", "function"),
    keyword: semanticColor(tokens["syntax.keyword"], "keyword"),
    "keyword.import": semanticColor(tokens["syntax.import"], "import", "keyword"),
    "keyword.controlFlow": semanticColor(tokens["syntax.keyword"], "keyword.control", "keyword"),
    modifier: semanticColor(tokens["syntax.keyword"], "keyword"),
    comment: semanticColor(tokens["syntax.comment"], "comment"),
    string: semanticColor(tokens["syntax.string"], "string"),
    formatSpecifier: semanticColor(tokens["syntax.string"], "string.special", "string"),
    number: semanticColor(tokens["syntax.number"], "number"),
    regexp: semanticColor(tokens["syntax.constant"], "string.regex", "constant"),
    operator: semanticColor(tokens["syntax.operator"], "operator"),
    label: semanticColor(tokens["syntax.property"], "label", "property"),
    unresolvedReference: semanticColor(tokens["syntax.variable"], "variable"),
    text: semanticColor(tokens["editor.foreground"], "primary", "text"),
  } satisfies Record<string, string>;
}

export function createSemanticTokenRules(
  tokens: ThemeTokenMap,
  syntax: Record<string, ExtensionThemeSyntaxStyle> = {},
): editor.ITokenThemeRule[] {
  return Object.entries(createSemanticTokenColors(tokens, syntax)).map(
    ([token, color]) => ({
      token,
      foreground: color.replace(/^#/, ""),
    }),
  );
}
