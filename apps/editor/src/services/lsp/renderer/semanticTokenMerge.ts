import { LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES } from "../../../shared/lsp";

type SemanticTokenSource = "lsp" | "textmate";

interface AbsoluteSemanticToken {
  line: number;
  character: number;
  length: number;
  tokenType: number;
  tokenModifiers: number;
  source: SemanticTokenSource;
}

interface SemanticTokenData {
  data: Uint32Array | number[];
  resultId?: string;
}

const grammarOwnedTokenTypes = new Set([
  "attribute",
  "comment",
  "keyword",
  "number",
  "operator",
  "regexp",
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
  "function",
  "interface",
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

function decodeSemanticTokens(
  data: Uint32Array | number[],
  source: SemanticTokenSource,
) {
  const tokens: AbsoluteSemanticToken[] = [];
  let line = 0;
  let character = 0;

  for (let offset = 0; offset < data.length; offset += 5) {
    const deltaLine = data[offset] ?? 0;
    const deltaCharacter = data[offset + 1] ?? 0;
    line += deltaLine;
    character = deltaLine === 0 ? character + deltaCharacter : deltaCharacter;
    tokens.push({
      line,
      character,
      length: data[offset + 2] ?? 0,
      tokenType: data[offset + 3] ?? 0,
      tokenModifiers: data[offset + 4] ?? 0,
      source,
    });
  }

  return tokens;
}

function tokensOverlap(a: AbsoluteSemanticToken, b: AbsoluteSemanticToken) {
  if (a.line !== b.line) return false;
  const aEnd = a.character + a.length;
  const bEnd = b.character + b.length;
  return a.character < bEnd && b.character < aEnd;
}

function semanticTokenPaintPriority(token: AbsoluteSemanticToken) {
  const tokenType =
    LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES[token.tokenType] ?? "variable";

  // TextMate grammars are stronger for lexical structure such as JSX tags,
  // attributes, strings, comments, and keywords. Language servers are stronger
  // for project-aware symbol meaning such as functions, methods, classes, and
  // parameters. Comparing those responsibilities prevents a broad LSP range
  // from flattening richer grammar color while keeping real symbols accurate.
  if (grammarOwnedTokenTypes.has(tokenType)) {
    return token.source === "textmate" ? 120 : 90;
  }
  if (symbolOwnedTokenTypes.has(tokenType)) {
    return token.source === "lsp" ? 120 : 105;
  }
  if (tokenType === "variable") {
    return token.source === "lsp" ? 45 : 35;
  }
  return token.source === "lsp" ? 80 : 70;
}

function strongestOverlappingTokenPriority(
  tokens: AbsoluteSemanticToken[],
  target: AbsoluteSemanticToken,
  startIndex: number,
) {
  let candidateIndex = startIndex;

  // Semantic token streams are ordered by line and column, and each stream is
  // non-overlapping by protocol. The cursor stays at the first range that could
  // touch the current target, so a range already passed is never searched again.
  // The former pairwise filter searched the complete opposite stream for every
  // token, which turned a 3,000-line file into hundreds of millions of overlap
  // checks on Electron's renderer thread.
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

function compareTokenPosition(
  left: AbsoluteSemanticToken,
  right: AbsoluteSemanticToken,
) {
  if (left.line !== right.line) return left.line - right.line;
  if (left.character !== right.character) {
    return left.character - right.character;
  }
  return left.source === "lsp" ? -1 : 1;
}

function mergeOrderedTokens(
  lspTokens: AbsoluteSemanticToken[],
  textMateTokens: AbsoluteSemanticToken[],
) {
  const merged: AbsoluteSemanticToken[] = [];
  let lspIndex = 0;
  let textMateIndex = 0;

  while (lspIndex < lspTokens.length && textMateIndex < textMateTokens.length) {
    const lspToken = lspTokens[lspIndex];
    const textMateToken = textMateTokens[textMateIndex];
    if (compareTokenPosition(lspToken, textMateToken) <= 0) {
      merged.push(lspToken);
      lspIndex += 1;
    } else {
      merged.push(textMateToken);
      textMateIndex += 1;
    }
  }

  while (lspIndex < lspTokens.length) {
    merged.push(lspTokens[lspIndex]);
    lspIndex += 1;
  }
  while (textMateIndex < textMateTokens.length) {
    merged.push(textMateTokens[textMateIndex]);
    textMateIndex += 1;
  }
  return merged;
}

function encodeSemanticTokens(tokens: AbsoluteSemanticToken[]) {
  const data: number[] = [];
  let previousLine = 0;
  let previousCharacter = 0;

  for (const token of tokens) {
    if (token.length <= 0) continue;
    const deltaLine = token.line - previousLine;
    const deltaCharacter =
      deltaLine === 0 ? token.character - previousCharacter : token.character;
    data.push(
      deltaLine,
      deltaCharacter,
      token.length,
      token.tokenType,
      token.tokenModifiers,
    );
    previousLine = token.line;
    previousCharacter = token.character;
  }

  return data;
}

export function mergeSemanticTokenLayers(input: {
  lsp?: number[];
  textMate?: SemanticTokenData | null;
  resultId?: string;
}) {
  const lspTokens = input.lsp ? decodeSemanticTokens(input.lsp, "lsp") : [];
  const textMateTokens = input.textMate
    ? decodeSemanticTokens(input.textMate.data, "textmate")
    : [];

  // Monaco rejects overlapping semantic-token ranges, so Axon resolves the two
  // sources before painting. The first sweep decides whether grammar structure
  // survives each LSP overlap; the second removes LSP ranges covered by those
  // retained grammar tokens. Both cursors move forward only, making the merge
  // scale with document tokens instead of multiplying both stream sizes.
  let lspStartIndex = 0;
  const selectedTextMateTokens = textMateTokens.filter((textMateToken) => {
    const textMatePriority = semanticTokenPaintPriority(textMateToken);
    const overlap = strongestOverlappingTokenPriority(
      lspTokens,
      textMateToken,
      lspStartIndex,
    );
    lspStartIndex = overlap.nextStartIndex;
    return overlap.strongestPriority <= textMatePriority;
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
  const merged = encodeSemanticTokens(
    mergeOrderedTokens(selectedLspTokens, selectedTextMateTokens),
  );

  return merged.length > 0
    ? {
        data: Uint32Array.from(merged),
        resultId: input.resultId,
      }
    : null;
}
