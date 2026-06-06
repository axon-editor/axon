import { type editor } from "monaco-editor";
import { type BuiltInThemeId, type ThemeColorToken } from "../../../shared/settings";

export type ThemeTokenMap = Record<ThemeColorToken, string>;

export interface AxonThemeDefinition {
  id: BuiltInThemeId;
  label: string;
  base: editor.BuiltinTheme;
  tokens: ThemeTokenMap;
  monacoColors: editor.IColors;
}

export function hexToMonaco(color: string) {
  return color.replace(/^#/, "").slice(0, 6);
}

export function createSyntaxRules(tokens: ThemeTokenMap): editor.ITokenThemeRule[] {
  const comment = hexToMonaco(tokens["syntax.comment"]);
  const keyword = hexToMonaco(tokens["syntax.keyword"]);
  const string = hexToMonaco(tokens["syntax.string"]);
  const number = hexToMonaco(tokens["syntax.number"]);
  const type = hexToMonaco(tokens["syntax.type"]);
  const fn = hexToMonaco(tokens["syntax.function"]);
  const method = hexToMonaco(tokens["syntax.method"]);
  const className = hexToMonaco(tokens["syntax.class"]);
  const iface = hexToMonaco(tokens["syntax.interface"]);
  const variable = hexToMonaco(tokens["syntax.variable"]);
  const parameter = hexToMonaco(tokens["syntax.parameter"]);
  const property = hexToMonaco(tokens["syntax.property"]);
  const constant = hexToMonaco(tokens["syntax.constant"]);
  const operator = hexToMonaco(tokens["syntax.operator"]);
  const bracket = hexToMonaco(tokens["syntax.bracket"]);
  const imports = hexToMonaco(tokens["syntax.import"]);
  const tag = hexToMonaco(tokens["syntax.tag"]);
  const attribute = hexToMonaco(tokens["syntax.attribute"]);
  const foreground = hexToMonaco(tokens["editor.foreground"]);

  // Monaco's token names are intentionally broad and language-dependent. Axon
  // exposes a smaller user-facing syntax vocabulary, then expands each token
  // into the common scopes emitted by TypeScript, Go, Rust, Python, C/C++,
  // HTML/JSX, JSON, and Markdown tokenizers. This is the part that makes
  // settings JSON predictable without asking users to know Monaco internals.
  return [
    { token: "comment", foreground: comment, fontStyle: "italic" },
    { token: "comment.doc", foreground: comment, fontStyle: "italic" },
    { token: "string", foreground: string },
    { token: "string.value.json", foreground: string },
    { token: "string.escape", foreground: constant, fontStyle: "bold" },
    { token: "string.regexp", foreground: constant },
    { token: "regexp", foreground: constant },
    { token: "number", foreground: number },
    { token: "number.json", foreground: number },
    { token: "constant.numeric", foreground: number },
    { token: "keyword", foreground: keyword, fontStyle: "italic" },
    { token: "keyword.control", foreground: keyword, fontStyle: "italic" },
    { token: "keyword.flow", foreground: keyword, fontStyle: "italic" },
    { token: "storage", foreground: keyword, fontStyle: "italic" },
    { token: "storage.type", foreground: keyword, fontStyle: "italic" },
    { token: "keyword.import", foreground: imports, fontStyle: "italic" },
    { token: "keyword.import.go", foreground: imports, fontStyle: "italic" },
    { token: "keyword.package.go", foreground: imports, fontStyle: "italic" },
    { token: "namespace", foreground: type },
    { token: "type", foreground: type },
    { token: "type.identifier", foreground: type },
    { token: "identifier.type", foreground: type },
    { token: "support.type", foreground: type, fontStyle: "italic" },
    { token: "entity.name.type", foreground: type },
    { token: "entity.name.class", foreground: className },
    { token: "class", foreground: className },
    { token: "interface", foreground: iface },
    { token: "entity.name.interface", foreground: iface },
    { token: "function", foreground: fn },
    { token: "function.call", foreground: fn },
    { token: "entity.name.function", foreground: fn },
    { token: "support.function", foreground: fn, fontStyle: "italic" },
    { token: "method", foreground: method },
    { token: "method.call", foreground: method },
    { token: "variable", foreground: variable },
    { token: "identifier", foreground: variable },
    { token: "variable.parameter", foreground: parameter },
    { token: "parameter", foreground: parameter },
    { token: "property", foreground: property },
    { token: "variable.other.property", foreground: property },
    { token: "support.variable.property", foreground: property },
    { token: "constant", foreground: constant },
    { token: "constant.language", foreground: constant, fontStyle: "italic" },
    { token: "predefined", foreground: constant, fontStyle: "italic" },
    { token: "variable.language", foreground: constant, fontStyle: "italic" },
    { token: "operator", foreground: operator },
    { token: "keyword.operator", foreground: operator },
    { token: "delimiter", foreground: bracket },
    { token: "delimiter.bracket", foreground: bracket },
    { token: "delimiter.parenthesis", foreground: bracket },
    { token: "delimiter.square", foreground: bracket },
    { token: "delimiter.curly", foreground: bracket },
    { token: "tag", foreground: tag },
    { token: "entity.name.tag", foreground: tag },
    { token: "attribute.name", foreground: attribute },
    { token: "entity.other.attribute-name", foreground: attribute },
    { token: "attribute.value", foreground: string },
    { token: "markup.heading", foreground: fn, fontStyle: "bold" },
    { token: "markup.bold", foreground: variable, fontStyle: "bold" },
    { token: "markup.italic", foreground: variable, fontStyle: "italic" },
    { token: "markup.inline.raw", foreground: string },
    { token: "markup.fenced_code", foreground: string },
    { token: "markup.list", foreground: operator },
    { token: "meta.link", foreground: property },
    { token: "text", foreground },
    { token: "source", foreground },
    { token: "plain", foreground },
    { token: "", foreground },
  ];
}
