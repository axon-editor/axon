import {
  LANGUAGE_SERVER_SEMANTIC_TOKEN_MODIFIERS,
  LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES,
} from "../../../shared/lsp";

type ShikiHighlighter = {
  codeToTokens: (
    code: string,
    options: {
      lang: string;
      theme: string;
      includeExplanation: true;
      tokenizeTimeLimit?: number;
      tokenizeMaxLineLength?: number;
    },
  ) => {
    tokens: Array<
      Array<{
        content: string;
        offset: number;
        explanation?: Array<{
          content: string;
          scopes: Array<{ scopeName: string }>;
        }>;
      }>
    >;
  };
};

type ShikiModule = {
  createHighlighterCore: (options: {
    themes: unknown[];
    langs: unknown[];
    engine: unknown;
  }) => Promise<ShikiHighlighter>;
};
type ShikiOnigurumaModule = {
  createOnigurumaEngine: (wasm: Promise<unknown>) => unknown;
};

const textMateLanguages = new Map([
  ["typescript", "typescript"],
  ["typescriptreact", "tsx"],
  ["javascript", "javascript"],
  ["javascriptreact", "jsx"],
]);
const tokenTypeIndexes = new Map<string, number>(
  LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES.map((tokenType, index) => [
    tokenType,
    index,
  ]),
);
const tokenModifierIndexes = new Map<string, number>(
  LANGUAGE_SERVER_SEMANTIC_TOKEN_MODIFIERS.map((modifier, index) => [
    modifier,
    index,
  ]),
);

let highlighterPromise: Promise<ShikiHighlighter | null> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = Promise.all([
      import("shiki/core"),
      import("shiki/engine/oniguruma"),
      import("shiki/langs/typescript.mjs"),
      import("shiki/langs/tsx.mjs"),
      import("shiki/langs/javascript.mjs"),
      import("shiki/langs/jsx.mjs"),
      import("shiki/themes/github-dark.mjs"),
    ])
      .then(([coreModule, onigurumaModule, ts, tsx, js, jsx, githubDark]) => {
        const shiki = coreModule as ShikiModule;
        const oniguruma = onigurumaModule as ShikiOnigurumaModule;
        return shiki.createHighlighterCore({
          themes: [githubDark.default],
          langs: [ts.default, tsx.default, js.default, jsx.default],
          engine: oniguruma.createOnigurumaEngine(import("shiki/wasm")),
        });
      })
      .catch(() => null);
  }

  return highlighterPromise;
}

function createLineStarts(code: string) {
  const lineStarts = [0];
  for (let index = 0; index < code.length; index += 1) {
    if (code[index] === "\n") lineStarts.push(index + 1);
  }
  return lineStarts;
}

function getScopeNames(scopes: Array<{ scopeName: string }>) {
  return scopes.map((scope) => scope.scopeName);
}

function hasScope(scopeNames: string[], fragment: string) {
  return scopeNames.some((scopeName) => scopeName.includes(fragment));
}

function startsWithScope(scopeNames: string[], prefix: string) {
  return scopeNames.some((scopeName) => scopeName.startsWith(prefix));
}

function resolveTokenType(scopeNames: string[]) {
  if (startsWithScope(scopeNames, "comment")) return "comment";
  if (startsWithScope(scopeNames, "string")) return "string";
  if (hasScope(scopeNames, "constant.numeric")) return "number";
  if (hasScope(scopeNames, "keyword.operator")) return "operator";
  if (startsWithScope(scopeNames, "keyword")) return "keyword";
  if (hasScope(scopeNames, "storage.modifier")) return "modifier";
  if (hasScope(scopeNames, "entity.name.function")) return "function";
  if (hasScope(scopeNames, "support.function")) return "function";
  if (hasScope(scopeNames, "entity.name.method")) return "method";
  if (hasScope(scopeNames, "variable.parameter")) return "parameter";
  if (hasScope(scopeNames, "entity.name.class")) return "class";
  if (hasScope(scopeNames, "support.class")) return "class";
  if (hasScope(scopeNames, "entity.name.interface")) return "interface";
  if (hasScope(scopeNames, "entity.name.enum")) return "enum";
  if (hasScope(scopeNames, "entity.name.type")) return "type";
  if (hasScope(scopeNames, "support.type")) return "type";
  if (hasScope(scopeNames, "entity.name.tag")) return "type";
  if (hasScope(scopeNames, "variable.other.property")) return "property";
  if (hasScope(scopeNames, "meta.object-literal.key")) return "property";
  if (hasScope(scopeNames, "support.variable.property")) return "property";
  if (hasScope(scopeNames, "variable.other.constant")) return "variable";
  if (startsWithScope(scopeNames, "variable")) return "variable";
  if (startsWithScope(scopeNames, "constant")) return "variable";
  if (startsWithScope(scopeNames, "storage")) return "keyword";
  return null;
}

function resolveTokenModifiers(scopeNames: string[]) {
  let modifiers = 0;
  if (hasScope(scopeNames, "variable.other.constant")) {
    modifiers |= 1 << (tokenModifierIndexes.get("readonly") ?? 0);
  }
  if (hasScope(scopeNames, "variable.language")) {
    modifiers |= 1 << (tokenModifierIndexes.get("defaultLibrary") ?? 0);
  }
  if (hasScope(scopeNames, "support.")) {
    modifiers |= 1 << (tokenModifierIndexes.get("defaultLibrary") ?? 0);
  }
  if (hasScope(scopeNames, "meta.definition")) {
    modifiers |= 1 << (tokenModifierIndexes.get("declaration") ?? 0);
  }
  return modifiers;
}

function pushRelativeToken(
  data: number[],
  state: { line: number; character: number },
  token: {
    line: number;
    character: number;
    length: number;
    tokenType: string;
    tokenModifiers: number;
  },
) {
  const tokenTypeIndex = tokenTypeIndexes.get(token.tokenType);
  if (tokenTypeIndex === undefined || token.length <= 0) return;

  const deltaLine = token.line - state.line;
  const deltaCharacter = deltaLine === 0 ? token.character - state.character : token.character;
  data.push(
    deltaLine,
    deltaCharacter,
    token.length,
    tokenTypeIndex,
    token.tokenModifiers,
  );
  state.line = token.line;
  state.character = token.character;
}

export async function createTextMateSemanticTokens(input: {
  languageId: string;
  content: string;
}) {
  const shikiLanguage = textMateLanguages.get(input.languageId);
  if (!shikiLanguage) return null;

  const highlighter = await getHighlighter();
  if (!highlighter) return null;

  const lineStarts = createLineStarts(input.content);
  const tokenData: number[] = [];
  const relativeState = { line: 0, character: 0 };

  // Shiki supplies the same TextMate scope stack VS Code themes are built
  // around. I only use it as a structural tokenizer here; Axon's active theme
  // still decides the final colors through Monaco semanticTokenColors. This
  // keeps grammar richness independent from the temporary tokenizer theme used
  // to make Shiki emit scope explanations.
  const shikiTokens = highlighter.codeToTokens(input.content, {
    lang: shikiLanguage,
    theme: "github-dark",
    includeExplanation: true,
    tokenizeTimeLimit: 120,
    tokenizeMaxLineLength: 30_000,
  });

  shikiTokens.tokens.forEach((lineTokens, lineIndex) => {
    const lineStart = lineStarts[lineIndex] ?? 0;

    lineTokens.forEach((token) => {
      let explanationOffset = token.offset;
      const explanations =
        token.explanation && token.explanation.length > 0
          ? token.explanation
          : [{ content: token.content, scopes: [] }];

      explanations.forEach((explanation) => {
        const content = explanation.content;
        const trimmedStart = content.search(/\S/);
        if (trimmedStart < 0) {
          explanationOffset += content.length;
          return;
        }

        const trimmedEnd = content.search(/\s+$/);
        const visibleLength =
          trimmedEnd >= 0 ? trimmedEnd : content.length;
        const tokenLength = visibleLength - trimmedStart;
        const scopeNames = getScopeNames(explanation.scopes);
        const tokenType = resolveTokenType(scopeNames);
        if (!tokenType) {
          explanationOffset += content.length;
          return;
        }

        pushRelativeToken(tokenData, relativeState, {
          line: lineIndex,
          character: explanationOffset - lineStart + trimmedStart,
          length: tokenLength,
          tokenType,
          tokenModifiers: resolveTokenModifiers(scopeNames),
        });
        explanationOffset += content.length;
      });
    });
  });

  return tokenData.length > 0
    ? {
        data: Uint32Array.from(tokenData),
        resultId: undefined,
      }
    : null;
}
