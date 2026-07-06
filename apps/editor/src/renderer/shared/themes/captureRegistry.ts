import { type editor } from "monaco-editor";
import { type ThemeTokenMap } from "./types";

export interface SyntaxStyle {
  color: string;
  fontStyle?: string;
}

export type SyntaxEntry = [string, SyntaxStyle];

export function hexToMonaco(color: string) {
  return color.replace(/^#/, "").slice(0, 6);
}

export type AxonCaptureName = string;

const MONACO_LANGUAGE_SUFFIXES = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "typescript",
  "javascript",
  "go",
  "rust",
  "rs",
  "python",
  "html",
  "css",
  "scss",
  "json",
  "yaml",
  "markdown",
] as const;

export const AXON_CAPTURE_ALIASES: Record<AxonCaptureName, string[]> = {
  attribute: [
    "attribute.name",
    "attribute.name.html",
    "attribute.name.js",
    "attribute.name.ts",
    "attribute.name.tsx",
    "attribute.name.jsx",
    "entity.other.attribute-name",
    "entity.other.attribute-name.html",
    "entity.other.attribute-name.js",
    "entity.other.attribute-name.ts",
    "entity.other.attribute-name.tsx",
    "entity.other.attribute-name.jsx",
  ],
  boolean: ["constant.language.boolean"],
  comment: ["comment"],
  "comment.doc": ["comment.doc"],
  constant: ["constant", "constant.language", "predefined"],
  "constant.builtin": ["predefined", "constant.language", "support.constant"],
  constructor: [
    "constructor",
    "entity.name.function.constructor",
    "variable.function.constructor",
  ],
  "diff.minus": [
    "markup.deleted",
    "markup.deleted.diff",
    "diff.deleted",
    "deleted",
  ],
  "diff.plus": [
    "markup.inserted",
    "markup.inserted.diff",
    "diff.inserted",
    "inserted",
  ],
  embedded: ["meta.embedded", "meta.embedded.block", "source.embedded", "text"],
  emphasis: ["markup.italic"],
  "emphasis.strong": ["markup.bold"],
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
    "entity.name.function.ts",
    "entity.name.function.tsx",
    "entity.name.function.js",
    "entity.name.function.jsx",
    "support.function",
    "support.function.dom",
  ],
  "function.builtin": ["support.function", "support.function.dom"],
  "function.definition": [
    "entity.name.function",
    "entity.name.function.ts",
    "entity.name.function.tsx",
    "meta.function.declaration",
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
    "entity.name.method",
    "entity.name.method.ts",
    "entity.name.method.tsx",
    "meta.method.declaration",
  ],
  "function.special": ["support.function", "keyword.other.special-method"],
  hint: ["token.info-token"],
  keyword: ["keyword", "keyword.control", "keyword.flow", "storage"],
  "keyword.control": ["keyword.control"],
  "keyword.operator": ["keyword.operator", "operator"],
  import: ["keyword.import", "keyword.import.go", "keyword.package.go"],
  label: ["label"],
  link_text: ["meta.link.reference.def", "string.link"],
  link_uri: ["meta.link.inline", "meta.link"],
  module: ["namespace", "entity.name.module", "entity.name.module.js"],
  namespace: ["namespace", "entity.name.namespace"],
  number: ["number", "number.json", "constant.numeric"],
  operator: ["operator", "keyword.operator"],
  predictive: ["inline-suggestion"],
  preproc: ["keyword.directive", "meta.preprocessor", "keyword.preprocessor"],
  primary: ["text", "source", "plain", ""],
  property: [
    "property",
    "identifier.property",
    "identifier.property.js",
    "identifier.property.ts",
    "identifier.property.tsx",
    "identifier.property.typescript",
    "variable.object.property",
    "variable.other.property",
    "variable.other.object.property",
    "support.variable.property",
    "support.type.property-name",
    "support.type.property-name.css",
    "support.type.property-name.scss",
    "support.type.property-name.less",
    "support.type.property-name.json",
    "support.type.property-name.yaml",
    "meta.object-literal.key",
    "meta.object-literal.key.ts",
    "meta.object-literal.key.tsx",
    "meta.object.member",
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
    "delimiter.bracket.tsx",
    "delimiter.bracket.jsx",
    "delimiter.parenthesis",
    "delimiter.square",
    "delimiter.curly",
    "punctuation.definition.tag",
    "punctuation.definition.tag.html",
    "punctuation.definition.tag.tsx",
    "punctuation.definition.tag.jsx",
  ],
  "punctuation.delimiter": [
    "delimiter",
    "delimiter.html",
    "delimiter.tsx",
    "delimiter.jsx",
    "delimiter.angle",
    "delimiter.angle.tsx",
    "delimiter.angle.jsx",
  ],
  "punctuation.list_marker": ["markup.list"],
  "punctuation.markup": ["markup"],
  "punctuation.special": ["delimiter", "keyword.operator", "operator"],
  selector: ["selector", "entity.other.attribute-name.class.css"],
  "selector.pseudo": ["entity.other.attribute-name.pseudo-class.css"],
  string: ["string", "string.value.json", "attribute.value"],
  "string.escape": ["string.escape"],
  "string.regex": ["string.regexp", "regexp"],
  "string.special": ["string.special"],
  "string.special.symbol": ["constant.other.symbol", "string.special"],
  tag: [
    "tag",
    "tag.html",
    "tag.tsx",
    "tag.jsx",
    "entity.name.tag",
    "entity.name.tag.html",
    "entity.name.tag.js",
    "entity.name.tag.ts",
    "entity.name.tag.tsx",
    "entity.name.tag.jsx",
    "meta.tag",
    "meta.tag.html",
    "meta.tag.tsx",
    "meta.tag.jsx",
    "support.class.component.tsx",
    "support.class.component.jsx",
  ],
  text: ["text", "text.jsx", "text.tsx"],
  "text.literal": ["markup.inline.raw", "markup.fenced_code"],
  title: ["markup.heading"],
  type: [
    "type",
    "type.identifier",
    "type.js",
    "type.ts",
    "type.tsx",
    "type.typescript",
    "identifier.type",
    "support.type",
    "support.class",
    "support.class.component",
    "entity.name.type",
    "entity.name.type.ts",
    "entity.name.type.tsx",
    "entity.name.class",
    "entity.name.class.ts",
    "entity.name.class.tsx",
    "class",
    "interface",
    "entity.name.interface",
    "entity.name.interface.ts",
    "entity.name.interface.tsx",
  ],
  "type.builtin": ["support.type", "support.class"],
  "type.class": ["class", "entity.name.class", "entity.name.class.ts"],
  "type.enum": ["enum", "entity.name.type.enum"],
  "type.interface": ["interface", "entity.name.interface"],
  "type.struct": ["struct", "entity.name.type.struct"],
  variable: [
    "variable",
    "identifier",
    "identifier.js",
    "identifier.ts",
    "identifier.tsx",
    "variable.other",
    "variable.other.readwrite",
    "variable.other.object",
    "identifier.go",
    "identifier.rust",
    "identifier.python",
    "variable.dockerfile",
  ],
  "variable.builtin": ["variable.language", "support.variable"],
  "variable.member": [
    "property",
    "identifier.property",
    "variable.object.property",
    "variable.other.property",
    "variable.other.object.property",
    "meta.object.member",
  ],
  "variable.mutable": ["variable", "variable.other.readwrite"],
  "variable.parameter": [
    "variable.parameter",
    "variable.parameter.ts",
    "variable.parameter.tsx",
    "parameter",
    "identifier.parameter",
  ],
  "variable.special": ["variable.language"],
  variant: ["variant", "enumMember"],
};

export function createDefaultCaptureEntries(tokens: ThemeTokenMap): SyntaxEntry[] {
  return [
    ["attribute", { color: tokens["syntax.attribute"] }],
    ["boolean", { color: tokens["syntax.constant"], fontStyle: "italic" }],
    ["comment", { color: tokens["syntax.comment"], fontStyle: "italic" }],
    ["comment.doc", { color: tokens["syntax.comment"], fontStyle: "italic" }],
    ["constant", { color: tokens["syntax.constant"] }],
    ["constant.builtin", { color: tokens["syntax.constant"] }],
    ["constructor", { color: tokens["syntax.class"] }],
    ["diff.minus", { color: tokens["syntax.constant"] }],
    ["diff.plus", { color: tokens["syntax.string"] }],
    ["embedded", { color: tokens["editor.foreground"] }],
    ["emphasis", { color: tokens["syntax.variable"], fontStyle: "italic" }],
    ["emphasis.strong", { color: tokens["syntax.variable"], fontStyle: "bold" }],
    ["enum", { color: tokens["syntax.type"] }],
    ["function", { color: tokens["syntax.function"] }],
    ["function.builtin", { color: tokens["syntax.function"] }],
    ["function.definition", { color: tokens["syntax.function"] }],
    ["function.method", { color: tokens["syntax.method"] }],
    ["function.special", { color: tokens["syntax.function"] }],
    ["hint", { color: tokens["syntax.property"], fontStyle: "bold" }],
    ["keyword", { color: tokens["syntax.keyword"], fontStyle: "italic" }],
    ["keyword.control", { color: tokens["syntax.keyword"], fontStyle: "italic" }],
    ["keyword.operator", { color: tokens["syntax.operator"] }],
    ["import", { color: tokens["syntax.import"], fontStyle: "italic" }],
    ["label", { color: tokens["syntax.property"] }],
    ["link_text", { color: tokens["syntax.property"] }],
    ["link_uri", { color: tokens["syntax.string"] }],
    ["module", { color: tokens["syntax.type"] }],
    ["namespace", { color: tokens["syntax.type"] }],
    ["number", { color: tokens["syntax.number"] }],
    ["operator", { color: tokens["syntax.operator"] }],
    ["predictive", { color: tokens["syntax.comment"] }],
    ["preproc", { color: tokens["syntax.keyword"], fontStyle: "italic" }],
    ["primary", { color: tokens["editor.foreground"] }],
    ["property", { color: tokens["syntax.property"] }],
    ["punctuation", { color: tokens["syntax.bracket"] }],
    ["punctuation.bracket", { color: tokens["syntax.bracket"] }],
    ["punctuation.delimiter", { color: tokens["syntax.bracket"] }],
    ["punctuation.list_marker", { color: tokens["syntax.operator"] }],
    ["punctuation.markup", { color: tokens["syntax.bracket"] }],
    ["punctuation.special", { color: tokens["syntax.operator"] }],
    ["selector", { color: tokens["syntax.tag"] }],
    ["selector.pseudo", { color: tokens["syntax.attribute"] }],
    ["string", { color: tokens["syntax.string"] }],
    ["string.escape", { color: tokens["syntax.constant"], fontStyle: "bold" }],
    ["string.regex", { color: tokens["syntax.constant"] }],
    ["string.special", { color: tokens["syntax.constant"] }],
    ["string.special.symbol", { color: tokens["syntax.constant"] }],
    ["tag", { color: tokens["syntax.tag"] }],
    ["text", { color: tokens["editor.foreground"] }],
    ["text.literal", { color: tokens["syntax.string"] }],
    ["title", { color: tokens["syntax.function"], fontStyle: "bold" }],
    ["type", { color: tokens["syntax.type"] }],
    ["type.builtin", { color: tokens["syntax.type"] }],
    ["type.class", { color: tokens["syntax.class"] }],
    ["type.enum", { color: tokens["syntax.type"] }],
    ["type.interface", { color: tokens["syntax.interface"] }],
    ["type.struct", { color: tokens["syntax.type"] }],
    ["variable", { color: tokens["syntax.variable"] }],
    ["variable.builtin", { color: tokens["syntax.constant"], fontStyle: "italic" }],
    ["variable.member", { color: tokens["syntax.property"] }],
    ["variable.mutable", { color: tokens["syntax.variable"] }],
    ["variable.parameter", { color: tokens["syntax.parameter"] }],
    ["variable.special", { color: tokens["syntax.constant"], fontStyle: "italic" }],
    ["variant", { color: tokens["syntax.constant"] }],
  ];
}

export function createMonacoTokenRulesFromCaptures(
  entries: Iterable<SyntaxEntry>,
): editor.ITokenThemeRule[] {
  const styles = new Map<string, SyntaxStyle>();
  for (const [captureName, style] of entries) {
    styles.set(captureName, style);
  }

  const captureNames = new Set([
    ...Object.keys(AXON_CAPTURE_ALIASES),
    ...styles.keys(),
  ]);
  const rulesByToken = new Map<
    string,
    { rule: editor.ITokenThemeRule; score: number }
  >();

  for (const captureName of captureNames) {
    const style = resolveCaptureStyle(captureName, styles);
    if (!style) continue;
    for (const token of AXON_CAPTURE_ALIASES[captureName] ?? [captureName]) {
      for (const expandedToken of expandMonacoTokenAliases(token)) {
        const rule: editor.ITokenThemeRule = {
          token: expandedToken,
          foreground: hexToMonaco(style.color),
        };
        if (style.fontStyle) rule.fontStyle = style.fontStyle;

        const score = scoreTokenRule(captureName, token, expandedToken);
        const existing = rulesByToken.get(expandedToken);
        if (existing && existing.score >= score) continue;
        rulesByToken.set(expandedToken, { rule, score });
      }
    }
  }

  return [...rulesByToken.values()]
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.rule);
}

export interface AxonTokenCaptureMatch {
  capture: string;
  token: string;
  match: "exact" | "prefix";
}

export function findCapturesForMonacoToken(
  monacoToken: string,
): AxonTokenCaptureMatch[] {
  const matches: AxonTokenCaptureMatch[] = [];

  for (const [capture, tokens] of Object.entries(AXON_CAPTURE_ALIASES)) {
    for (const token of tokens) {
      for (const expandedToken of expandMonacoTokenAliases(token)) {
        if (expandedToken === monacoToken) {
          matches.push({ capture, token: expandedToken, match: "exact" });
          continue;
        }
        if (monacoToken.startsWith(`${expandedToken}.`)) {
          matches.push({ capture, token: expandedToken, match: "prefix" });
        }
      }
    }
  }

  return matches.sort((a, b) => {
    if (a.match !== b.match) return a.match === "exact" ? -1 : 1;
    return b.token.length - a.token.length || a.capture.localeCompare(b.capture);
  });
}

function expandMonacoTokenAliases(token: string) {
  if (!token || token.includes(" ")) return [token];
  const aliases = new Set([token]);
  const lastPart = token.split(".").at(-1);
  const alreadySuffixed =
    lastPart !== undefined &&
    MONACO_LANGUAGE_SUFFIXES.includes(
      lastPart as (typeof MONACO_LANGUAGE_SUFFIXES)[number],
    );

  if (!alreadySuffixed) {
    for (const suffix of MONACO_LANGUAGE_SUFFIXES) {
      aliases.add(`${token}.${suffix}`);
    }
  }

  return [...aliases];
}

function scoreTokenRule(
  captureName: string,
  sourceToken: string,
  expandedToken: string,
) {
  // Monaco themes are finally flat token rules, but Axon's source of truth is
  // a richer capture graph. When several captures map to the same Monaco token,
  // choose the rule that came from the most specific capture/token pair. This
  // prevents broad aliases like punctuation -> delimiter from repainting a
  // stronger alias like punctuation.bracket -> delimiter.bracket.ts.
  const tokenSpecificity = sourceToken.split(".").length * 100;
  const captureSpecificity = captureName.split(".").length * 10;
  const exactSuffixBonus = expandedToken === sourceToken ? 0 : 1;
  return tokenSpecificity + captureSpecificity + exactSuffixBonus;
}

export function resolveCaptureStyleForInspector(
  captureName: string,
  entries: Iterable<SyntaxEntry>,
) {
  return resolveCaptureStyle(captureName, new Map(entries)) ?? null;
}

function resolveCaptureStyle(
  captureName: string,
  styles: ReadonlyMap<string, SyntaxStyle>,
) {
  // Axon treats Zed-compatible syntax names as the design-level color API.
  // Grammars can emit very specific captures such as function.method.call or
  // string.special.symbol; walking toward the parent capture preserves that
  // richness without forcing every theme to define every child name.
  let current = captureName;
  while (current) {
    const style = styles.get(current);
    if (style) return style;
    const dotIndex = current.lastIndexOf(".");
    if (dotIndex === -1) break;
    current = current.slice(0, dotIndex);
  }
  return styles.get("primary");
}
