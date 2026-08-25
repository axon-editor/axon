import { type LanguageServerSemanticTokensLegend } from "../../../shared/lsp";

export type HighlightTokenSource = "lsp" | "textmate" | "fallback";

export interface HighlightToken {
  line: number;
  character: number;
  length: number;
  tokenType: string;
  modifiers: string[];
  captureCandidates: string[];
  source: HighlightTokenSource;
  languageId: string;
  scopeNames?: string[];
}

export interface HighlightTokenSet {
  tokens: HighlightToken[];
  resultId?: string;
}

const grammarOwnedCaptures = new Set([
  "attribute",
  "boolean",
  "character",
  "comment",
  "embedded",
  "keyword",
  "number",
  "operator",
  "preproc",
  "punctuation",
  "selector",
  "string",
  "tag",
  "text",
]);

const symbolOwnedTokenTypes = new Set([
  "builtinType",
  "class",
  "constructor",
  "enum",
  "enumMember",
  "event",
  "function",
  "interface",
  "macro",
  "method",
  "namespace",
  "parameter",
  "property",
  "struct",
  "trait",
  "type",
  "typeAlias",
  "typeParameter",
]);

const symbolOwnedCaptureRoots = new Set([
  "constructor",
  "enum",
  "function",
  "module",
  "namespace",
  "parameter",
  "property",
  "type",
  "variable",
  "variant",
]);

const semanticTypeCaptures: Record<string, string[]> = {
  namespace: ["namespace", "module"],
  type: ["type"],
  typeAlias: ["type.definition", "type"],
  builtinType: ["type.builtin", "type"],
  class: ["type.class", "type"],
  enum: ["enum", "type"],
  interface: ["type.interface", "type"],
  struct: ["type.struct", "type"],
  trait: ["type.interface", "type"],
  union: ["type", "variant"],
  typeParameter: ["type", "parameter"],
  parameter: ["variable.parameter", "parameter", "variable"],
  variable: ["variable"],
  property: ["property", "variable.member"],
  enumMember: ["variant", "constant"],
  event: ["function.method", "function"],
  function: ["function"],
  method: ["function.method", "function"],
  constructor: ["constructor", "type.class", "type"],
  macro: ["function.macro", "constant.macro", "function"],
  keyword: ["keyword"],
  selfKeyword: ["variable.special", "constant"],
  modifier: ["keyword.modifier", "keyword"],
  comment: ["comment"],
  string: ["string"],
  number: ["number"],
  regexp: ["string.regex", "string.regexp", "string"],
  operator: ["operator", "keyword.operator"],
  decorator: ["function.decorator", "attribute"],
  tag: ["tag"],
  attribute: ["attribute", "tag.attribute"],
  label: ["label"],
  lifetime: ["label", "type"],
  formatSpecifier: ["string.special", "string"],
  unresolvedReference: ["variable"],
  text: ["text", "primary"],
};

const semanticTokenTypeAliases: Record<string, string> = {
  member: "property",
  builtin: "builtinType",
  escapeSequence: "string",
};

const semanticTokenModifierAliases: Record<string, string> = {
  readOnly: "readonly",
  modifying: "modification",
};

function modifierCaptureCandidates(
  tokenType: string,
  modifiers: string[],
  baseCapture: string,
) {
  const candidates: string[] = [];
  const hasDefinition =
    modifiers.includes("declaration") || modifiers.includes("definition");

  if (hasDefinition) {
    if (tokenType === "function") candidates.push("function.definition");
    if (tokenType === "method") candidates.push("function.method.definition");
    if (tokenType === "class") candidates.push("type.class.definition");
    if (["type", "typeAlias"].includes(tokenType)) {
      candidates.push("type.definition");
    }
  }
  if (
    modifiers.includes("builtin") ||
    modifiers.includes("defaultLibrary") ||
    modifiers.includes("library")
  ) {
    const builtinCapture =
      tokenType === "function" || tokenType === "method"
        ? "function.builtin"
        : ["type", "typeAlias", "builtinType", "class", "interface"].includes(
              tokenType,
            )
          ? "type.builtin"
          : tokenType === "variable"
            ? "variable.builtin"
            : `${baseCapture}.builtin`;
    candidates.push(builtinCapture);
  }
  if (modifiers.includes("import")) candidates.push("keyword.import", "import");
  if (modifiers.includes("controlFlow")) candidates.push("keyword.conditional");
  if (modifiers.includes("readonly") || modifiers.includes("constant")) {
    candidates.push(tokenType === "enumMember" ? "variant" : "constant");
  }
  for (const modifier of modifiers) {
    candidates.push(`${baseCapture}.${modifier}`);
  }
  return candidates;
}

export function semanticCaptureCandidates(
  tokenType: string,
  modifiers: string[],
  languageId: string,
) {
  const normalizedTokenType = semanticTokenTypeAliases[tokenType] ?? tokenType;
  const normalizedModifiers = modifiers.map(
    (modifier) => semanticTokenModifierAliases[modifier] ?? modifier,
  );
  const baseCaptures = semanticTypeCaptures[normalizedTokenType] ?? [tokenType];
  const candidates: string[] = [];
  for (const baseCapture of baseCaptures) {
    candidates.push(
      ...modifierCaptureCandidates(
        normalizedTokenType,
        normalizedModifiers,
        baseCapture,
      ),
      `${baseCapture}:${languageId}`,
      baseCapture,
    );
  }
  return [...new Set(candidates)];
}

export function decodeLanguageServerSemanticTokens(input: {
  data: number[];
  legend: LanguageServerSemanticTokensLegend;
  languageId: string;
  resultId?: string;
}): HighlightTokenSet | null {
  const tokens: HighlightToken[] = [];
  let line = 0;
  let character = 0;

  for (let offset = 0; offset < input.data.length; offset += 5) {
    const deltaLine = input.data[offset] ?? 0;
    const deltaCharacter = input.data[offset + 1] ?? 0;
    line += deltaLine;
    character = deltaLine === 0 ? character + deltaCharacter : deltaCharacter;

    const tokenType = input.legend.tokenTypes[input.data[offset + 3] ?? -1];
    const length = input.data[offset + 2] ?? 0;
    if (!tokenType || length <= 0) continue;
    const modifierBits = input.data[offset + 4] ?? 0;
    const modifiers = input.legend.tokenModifiers.filter(
      (_modifier, index) => (modifierBits & (1 << index)) !== 0,
    );
    tokens.push({
      line,
      character,
      length,
      tokenType,
      modifiers,
      captureCandidates: semanticCaptureCandidates(
        tokenType,
        modifiers,
        input.languageId,
      ),
      source: "lsp",
      languageId: input.languageId,
    });
  }

  return tokens.length > 0 ? { tokens, resultId: input.resultId } : null;
}

function tokensOverlap(a: HighlightToken, b: HighlightToken) {
  if (a.line !== b.line) return false;
  const aEnd = a.character + a.length;
  const bEnd = b.character + b.length;
  return a.character < bEnd && b.character < aEnd;
}

function semanticTokenPaintPriority(token: HighlightToken) {
  const captureRoot = token.captureCandidates[0]?.split(/[.:]/)[0] ?? "";
  if (grammarOwnedCaptures.has(captureRoot)) {
    return token.source === "lsp" ? 90 : 120;
  }
  if (token.tokenType === "variable" && captureRoot === "variable") {
    return token.source === "lsp" ? 45 : 35;
  }
  if (
    symbolOwnedTokenTypes.has(token.tokenType) ||
    symbolOwnedCaptureRoots.has(captureRoot)
  ) {
    return token.source === "lsp" ? 120 : 105;
  }
  return token.source === "lsp" ? 100 : 70;
}

function strongestOverlappingTokenPriority(
  tokens: HighlightToken[],
  target: HighlightToken,
  startIndex: number,
) {
  let candidateIndex = startIndex;
  while (candidateIndex < tokens.length) {
    const candidate = tokens[candidateIndex];
    const endsBeforeTarget =
      candidate.line < target.line ||
      (candidate.line === target.line &&
        candidate.character + candidate.length <= target.character);
    if (!endsBeforeTarget) break;
    candidateIndex += 1;
  }

  let strongestPriority = -1;
  for (
    let overlapIndex = candidateIndex;
    overlapIndex < tokens.length;
    overlapIndex += 1
  ) {
    const candidate = tokens[overlapIndex];
    if (candidate.line > target.line) break;
    if (
      candidate.line === target.line &&
      candidate.character >= target.character + target.length
    ) {
      break;
    }
    if (!tokensOverlap(candidate, target)) continue;
    strongestPriority = Math.max(
      strongestPriority,
      semanticTokenPaintPriority(candidate),
    );
  }
  return { nextStartIndex: candidateIndex, strongestPriority };
}

function compareTokenPosition(left: HighlightToken, right: HighlightToken) {
  if (left.line !== right.line) return left.line - right.line;
  if (left.character !== right.character) {
    return left.character - right.character;
  }
  return left.source === "lsp" ? -1 : 1;
}

function mergeOrderedTokens(
  lspTokens: HighlightToken[],
  textMateTokens: HighlightToken[],
) {
  const merged: HighlightToken[] = [];
  let lspIndex = 0;
  let textMateIndex = 0;
  while (lspIndex < lspTokens.length && textMateIndex < textMateTokens.length) {
    if (
      compareTokenPosition(
        lspTokens[lspIndex],
        textMateTokens[textMateIndex],
      ) <= 0
    ) {
      merged.push(lspTokens[lspIndex]);
      lspIndex += 1;
    } else {
      merged.push(textMateTokens[textMateIndex]);
      textMateIndex += 1;
    }
  }
  merged.push(
    ...lspTokens.slice(lspIndex),
    ...textMateTokens.slice(textMateIndex),
  );
  return merged;
}

export function mergeHighlightTokenLayers(input: {
  lsp?: HighlightTokenSet | null;
  textMate?: HighlightTokenSet | null;
  resultId?: string;
}): HighlightTokenSet | null {
  const lspTokens = input.lsp?.tokens ?? [];
  const textMateTokens = input.textMate?.tokens ?? [];

  let lspStartIndex = 0;
  const selectedTextMateTokens = textMateTokens.filter((textMateToken) => {
    const overlap = strongestOverlappingTokenPriority(
      lspTokens,
      textMateToken,
      lspStartIndex,
    );
    lspStartIndex = overlap.nextStartIndex;
    return (
      overlap.strongestPriority <= semanticTokenPaintPriority(textMateToken)
    );
  });

  let textMateStartIndex = 0;
  const selectedLspTokens = lspTokens.filter((lspToken) => {
    const overlap = strongestOverlappingTokenPriority(
      selectedTextMateTokens,
      lspToken,
      textMateStartIndex,
    );
    textMateStartIndex = overlap.nextStartIndex;
    return overlap.strongestPriority < 0;
  });
  const tokens = mergeOrderedTokens(selectedLspTokens, selectedTextMateTokens);
  return tokens.length > 0
    ? { tokens, resultId: input.resultId ?? input.lsp?.resultId }
    : null;
}
