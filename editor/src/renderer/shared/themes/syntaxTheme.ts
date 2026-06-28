import { type editor } from "monaco-editor";
import { type ExtensionThemeSyntaxStyle } from "../../../shared/extensions";
import { type ThemeTokenMap } from "./types";

export interface SyntaxStyle {
  color: string;
  fontStyle?: string;
}

export type SyntaxEntry = [string, SyntaxStyle];

function hexToMonaco(color: string) {
  return color.replace(/^#/, "").slice(0, 6);
}

const captureAliases: Record<string, string[]> = {
  attribute: [
    "attribute.name",
    "attribute.name.tsx",
    "attribute.name.jsx",
    "entity.other.attribute-name",
  ],
  boolean: ["constant.language.boolean", "constant.language"],
  comment: ["comment"],
  "comment.doc": ["comment.doc"],
  constant: ["constant", "constant.language", "predefined", "variable.language"],
  emphasis: ["markup.italic"],
  "emphasis.strong": ["markup.bold"],
  constructor: ["constructor", "entity.name.function.constructor"],
  enum: ["enum", "entity.name.type.enum"],
  function: [
    "function",
    "function.call",
    "identifier.function",
    "identifier.function.ts",
    "identifier.function.tsx",
    "identifier.function.typescript",
    "identifier.function.go",
    "identifier.function.rust",
    "identifier.function.python",
    "entity.name.function",
    "support.function",
  ],
  "function.method": [
    "method",
    "method.call",
    "identifier.method",
    "identifier.method.ts",
    "identifier.method.tsx",
    "identifier.method.typescript",
    "member",
    "member.go",
    "member.rust",
  ],
  keyword: [
    "keyword",
    "keyword.control",
    "keyword.flow",
    "storage",
    "storage.type",
    "keyword.dockerfile",
  ],
  import: ["keyword.import", "keyword.import.go", "keyword.package.go"],
  label: ["label"],
  link_text: ["meta.link.reference.def", "string.link"],
  link_uri: ["meta.link.inline", "meta.link"],
  namespace: ["namespace"],
  number: ["number", "number.json", "constant.numeric"],
  operator: ["operator", "keyword.operator"],
  primary: ["text", "source", "plain", ""],
  property: [
    "property",
    "identifier.property",
    "identifier.property.ts",
    "identifier.property.tsx",
    "identifier.property.typescript",
    "variable.other.property",
    "support.variable.property",
    "support.type.property-name",
    "support.type.property-name.css",
    "support.type.property-name.scss",
    "support.type.property-name.less",
    "support.type.property-name.json",
    "support.type.property-name.yaml",
    "meta.object-literal.key",
    "string.key",
    "string.key.json",
    "string.unquoted.label",
    "string.unquoted.label.js",
    "string.unquoted.label.ts",
    "string.unquoted.yaml",
    "entity.name.tag.yaml",
    "key",
    "key.json",
    "key.yaml",
    "key.toml",
  ],
  punctuation: ["delimiter"],
  "punctuation.bracket": [
    "delimiter.bracket",
    "delimiter.parenthesis",
    "delimiter.square",
    "delimiter.curly",
  ],
  "punctuation.delimiter": ["delimiter"],
  "punctuation.list_marker": ["markup.list"],
  "punctuation.markup": ["markup"],
  selector: ["selector", "entity.other.attribute-name.class.css"],
  "selector.pseudo": ["entity.other.attribute-name.pseudo-class.css"],
  string: ["string", "string.value.json", "attribute.value"],
  "string.escape": ["string.escape"],
  "string.regex": ["string.regexp", "regexp"],
  "string.special": ["string.special"],
  tag: ["tag", "tag.tsx", "tag.jsx", "entity.name.tag"],
  "text.literal": ["markup.inline.raw", "markup.fenced_code"],
  title: ["markup.heading"],
  type: [
    "type",
    "type.identifier",
    "type.ts",
    "type.typescript",
    "identifier.type",
    "support.type",
    "entity.name.type",
    "entity.name.class",
    "class",
    "interface",
    "entity.name.interface",
  ],
  variable: [
    "variable",
    "identifier",
    "identifier.go",
    "identifier.rust",
    "identifier.python",
    "variable.dockerfile",
  ],
  "variable.parameter": ["variable.parameter", "parameter", "identifier.parameter"],
  "variable.special": ["variable.language"],
  variant: ["variant", "enumMember"],
};

function normalizeFontStyle(style: ExtensionThemeSyntaxStyle) {
  const parts = [
    style.fontStyle,
    style.fontWeight === "bold" || style.fontWeight === 700 ? "bold" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return parts || undefined;
}

export class AxonSyntaxTheme {
  private readonly styles = new Map<string, SyntaxStyle>();

  constructor(entries: SyntaxEntry[]) {
    for (const [captureName, style] of entries) {
      this.styles.set(captureName, style);
    }
  }

  merge(entries: SyntaxEntry[]) {
    return new AxonSyntaxTheme([...this.styles.entries(), ...entries]);
  }

  styleForName(captureName: string) {
    // Zed resolves syntax captures by walking from the most specific capture
    // name to the nearest styled prefix. That matters because real grammars
    // emit captures such as function.method.call or string.special.symbol, and
    // a theme should not need to list every possible child capture before the
    // editor looks rich.
    let current = captureName;
    while (current) {
      const style = this.styles.get(current);
      if (style) return style;
      const dotIndex = current.lastIndexOf(".");
      if (dotIndex === -1) break;
      current = current.slice(0, dotIndex);
    }
    return this.styles.get("primary");
  }

  toMonacoRules() {
    const rules: editor.ITokenThemeRule[] = [];
    const seen = new Set<string>();

    const captureNames = new Set([
      ...Object.keys(captureAliases),
      ...this.styles.keys(),
    ]);
    for (const captureName of captureNames) {
      const style = this.styleForName(captureName);
      if (!style) continue;
      for (const token of captureAliases[captureName] ?? [captureName]) {
        const key = `${token}:${style.color}:${style.fontStyle ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const rule: editor.ITokenThemeRule = {
          token,
          foreground: hexToMonaco(style.color),
        };
        if (style.fontStyle) rule.fontStyle = style.fontStyle;
        rules.push(rule);
      }
    }

    return rules;
  }
}

export function createAxonSyntaxTheme(tokens: ThemeTokenMap) {
  return new AxonSyntaxTheme([
    ["attribute", { color: tokens["syntax.attribute"] }],
    ["boolean", { color: tokens["syntax.constant"], fontStyle: "italic" }],
    ["comment", { color: tokens["syntax.comment"], fontStyle: "italic" }],
    ["comment.doc", { color: tokens["syntax.comment"], fontStyle: "italic" }],
    ["constant", { color: tokens["syntax.constant"] }],
    ["emphasis", { color: tokens["syntax.variable"], fontStyle: "italic" }],
    ["emphasis.strong", { color: tokens["syntax.variable"], fontStyle: "bold" }],
    ["constructor", { color: tokens["syntax.class"] }],
    ["enum", { color: tokens["syntax.type"] }],
    ["function", { color: tokens["syntax.function"] }],
    ["function.method", { color: tokens["syntax.method"] }],
    ["keyword", { color: tokens["syntax.keyword"], fontStyle: "italic" }],
    ["import", { color: tokens["syntax.import"], fontStyle: "italic" }],
    ["label", { color: tokens["syntax.property"] }],
    ["link_text", { color: tokens["syntax.property"] }],
    ["link_uri", { color: tokens["syntax.string"] }],
    ["namespace", { color: tokens["syntax.type"] }],
    ["number", { color: tokens["syntax.number"] }],
    ["operator", { color: tokens["syntax.operator"] }],
    ["primary", { color: tokens["editor.foreground"] }],
    ["property", { color: tokens["syntax.property"] }],
    ["punctuation", { color: tokens["syntax.bracket"] }],
    ["punctuation.bracket", { color: tokens["syntax.bracket"] }],
    ["punctuation.delimiter", { color: tokens["syntax.bracket"] }],
    ["punctuation.list_marker", { color: tokens["syntax.operator"] }],
    ["punctuation.markup", { color: tokens["syntax.bracket"] }],
    ["selector", { color: tokens["syntax.tag"] }],
    ["selector.pseudo", { color: tokens["syntax.attribute"] }],
    ["string", { color: tokens["syntax.string"] }],
    ["string.escape", { color: tokens["syntax.constant"], fontStyle: "bold" }],
    ["string.regex", { color: tokens["syntax.constant"] }],
    ["string.special", { color: tokens["syntax.constant"] }],
    ["tag", { color: tokens["syntax.tag"] }],
    ["text.literal", { color: tokens["syntax.string"] }],
    ["title", { color: tokens["syntax.function"], fontStyle: "bold" }],
    ["type", { color: tokens["syntax.type"] }],
    ["variable", { color: tokens["syntax.variable"] }],
    ["variable.parameter", { color: tokens["syntax.parameter"] }],
    ["variable.special", { color: tokens["syntax.constant"], fontStyle: "italic" }],
    ["variant", { color: tokens["syntax.constant"] }],
  ]);
}

export function createExtensionSyntaxThemeEntries(
  syntax: Record<string, ExtensionThemeSyntaxStyle>,
): SyntaxEntry[] {
  return Object.entries(syntax)
    .filter(([, style]) => typeof style.color === "string")
    .map(([captureName, style]) => [
      captureName,
      {
        color: style.color ?? "#d8dee9",
        fontStyle: normalizeFontStyle(style),
      },
    ]);
}
