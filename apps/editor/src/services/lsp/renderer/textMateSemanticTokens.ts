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
  createOnigurumaEngine: (wasm: unknown) => Promise<unknown>;
};
type ShikiWasmModule = {
  default?: unknown;
  getWasmInstance?: unknown;
};

type ShikiLanguageModule = { default: unknown };
type TextMateLanguage = {
  id: string;
  load: () => Promise<ShikiLanguageModule>;
};

const textMateLanguages = new Map<string, TextMateLanguage>([
  ["typescript", { id: "typescript", load: () => import("shiki/langs/typescript.mjs") }],
  ["typescriptreact", { id: "tsx", load: () => import("shiki/langs/tsx.mjs") }],
  ["javascript", { id: "javascript", load: () => import("shiki/langs/javascript.mjs") }],
  ["javascriptreact", { id: "jsx", load: () => import("shiki/langs/jsx.mjs") }],
  ["go", { id: "go", load: () => import("shiki/langs/go.mjs") }],
  ["rust", { id: "rust", load: () => import("shiki/langs/rust.mjs") }],
  ["python", { id: "python", load: () => import("shiki/langs/python.mjs") }],
  ["java", { id: "java", load: () => import("shiki/langs/java.mjs") }],
  ["csharp", { id: "csharp", load: () => import("shiki/langs/csharp.mjs") }],
  ["kotlin", { id: "kotlin", load: () => import("shiki/langs/kotlin.mjs") }],
  ["php", { id: "php", load: () => import("shiki/langs/php.mjs") }],
  ["lua", { id: "lua", load: () => import("shiki/langs/lua.mjs") }],
  ["cpp", { id: "cpp", load: () => import("shiki/langs/cpp.mjs") }],
  ["c", { id: "c", load: () => import("shiki/langs/c.mjs") }],
  ["html", { id: "html", load: () => import("shiki/langs/html.mjs") }],
  ["css", { id: "css", load: () => import("shiki/langs/css.mjs") }],
  ["scss", { id: "scss", load: () => import("shiki/langs/scss.mjs") }],
  ["less", { id: "less", load: () => import("shiki/langs/less.mjs") }],
  ["json", { id: "json", load: () => import("shiki/langs/json.mjs") }],
  ["yaml", { id: "yaml", load: () => import("shiki/langs/yaml.mjs") }],
  ["shell", { id: "shell", load: () => import("shiki/langs/shell.mjs") }],
  ["dockerfile", { id: "dockerfile", load: () => import("shiki/langs/dockerfile.mjs") }],
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

let highlighterFoundationPromise: Promise<{
  shiki: ShikiModule;
  engine: unknown;
  theme: unknown;
}> | null = null;
const highlighterPromises = new Map<string, Promise<ShikiHighlighter | null>>();
let highlighterLoadError: string | null = null;
let highlighterLoadWarningShown = false;

function describeError(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export function getTextMateSemanticTokenStatus() {
  return {
    ready: highlighterPromises.size > 0 && highlighterLoadError === null,
    error: highlighterLoadError,
  };
}

function getHighlighterFoundation() {
  highlighterFoundationPromise ??= Promise.all([
    import("shiki/core"),
    import("shiki/engine/oniguruma"),
    import("@shikijs/engine-oniguruma/wasm-inlined"),
    import("shiki/themes/github-dark.mjs"),
  ]).then(async ([coreModule, onigurumaModule, wasmModule, githubDark]) => {
    const oniguruma = onigurumaModule as ShikiOnigurumaModule;
    const wasm = wasmModule as ShikiWasmModule;
    return {
      shiki: coreModule as ShikiModule,
      engine: await oniguruma.createOnigurumaEngine(
        wasm.default ?? wasm.getWasmInstance,
      ),
      theme: githubDark.default,
    };
  });
  return highlighterFoundationPromise;
}

function getHighlighter(language: TextMateLanguage) {
  let highlighterPromise = highlighterPromises.get(language.id);
  if (!highlighterPromise) {
    // Loading every grammar on the first edited file made a JSON or Go document
    // pay for two dozen unrelated languages. Each language now gets an isolated
    // lazy chunk while the expensive Oniguruma engine is shared across them.
    highlighterPromise = Promise.all([
      getHighlighterFoundation(),
      language.load(),
    ])
      .then(([foundation, grammar]) => {
        highlighterLoadError = null;
        return foundation.shiki.createHighlighterCore({
          themes: [foundation.theme],
          langs: [grammar.default],
          engine: foundation.engine,
        });
      })
      .catch((err) => {
        highlighterLoadError = describeError(err);

        // A failed dynamic import should not permanently flatten syntax for the
        // whole renderer session. Vite/Electron can briefly reject a lazy chunk
        // during startup or reload; clearing the cached promise lets the next
        // semantic refresh try again instead of returning `null` forever.
        highlighterPromises.delete(language.id);
        if (!highlighterLoadWarningShown) {
          highlighterLoadWarningShown = true;
          console.warn(
            "[syntax] TextMate highlighter unavailable:",
            highlighterLoadError,
          );
        }
        return null;
      });
    highlighterPromises.set(language.id, highlighterPromise);
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

function isUppercaseIdentifier(identifier: string) {
  return /^[A-Z_][A-Z0-9_]*$/.test(identifier);
}

function isClassLikeIdentifier(identifier: string) {
  return /^[A-Z]/.test(identifier);
}

function previousMeaningfulCharacter(line: string, index: number) {
  for (let offset = index - 1; offset >= 0; offset -= 1) {
    const char = line[offset];
    if (!/\s/.test(char)) return char;
  }
  return "";
}

function nextMeaningfulCharacter(line: string, index: number) {
  for (let offset = index; offset < line.length; offset += 1) {
    const char = line[offset];
    if (!/\s/.test(char)) return char;
  }
  return "";
}

function isMemberAccessLanguage(languageId: string) {
  return [
    "typescript",
    "typescriptreact",
    "javascript",
    "javascriptreact",
    "go",
    "rust",
    "python",
    "java",
    "csharp",
    "kotlin",
    "php",
    "lua",
    "cpp",
    "c",
  ].includes(languageId);
}

function resolveMemberAccessTokenType(input: {
  languageId: string;
  lineContent: string;
  identifier: string;
  startColumnZeroBased: number;
}) {
  if (!isMemberAccessLanguage(input.languageId)) return null;
  const previousChar = previousMeaningfulCharacter(
    input.lineContent,
    input.startColumnZeroBased,
  );
  if (previousChar !== ".") return null;

  const nextChar = nextMeaningfulCharacter(
    input.lineContent,
    input.startColumnZeroBased + input.identifier.length,
  );
  if (nextChar === "(") return null;

  return "property";
}

function resolvePythonFallbackTokenType(
  lineContent: string,
  identifier: string,
  startColumnZeroBased: number,
) {
  const before = lineContent.slice(0, startColumnZeroBased);
  const previousChar = previousMeaningfulCharacter(lineContent, startColumnZeroBased);
  const nextChar = nextMeaningfulCharacter(
    lineContent,
    startColumnZeroBased + identifier.length,
  );
  const trimmedLine = lineContent.trimStart();

  if (identifier === "self" || identifier === "cls") return "selfKeyword";
  if (previousChar === ".") return "property";
  if (/\bclass\s+$/.test(before)) return "class";
  if (/\bdef\s+$/.test(before)) return "function";
  if (nextChar === "(") {
    return isClassLikeIdentifier(identifier) ? "constructor" : "function";
  }

  if (/^(from|import)\s+/.test(trimmedLine)) {
    if (/\bas\s+$/.test(before)) {
      return isClassLikeIdentifier(identifier) ? "type" : "variable";
    }
    if (/\bimport\s+/.test(before)) {
      return isClassLikeIdentifier(identifier) ? "type" : "variable";
    }
    if (/^from\s+/.test(trimmedLine)) return "namespace";
  }

  if (isUppercaseIdentifier(identifier)) return "variable";
  if (isClassLikeIdentifier(identifier)) return "type";
  return null;
}

function resolveFallbackTokenType(input: {
  languageId: string;
  lineContent: string;
  identifier: string;
  startColumnZeroBased: number;
  scopeNames: string[];
}) {
  const memberAccessType = resolveMemberAccessTokenType(input);
  if (memberAccessType) return memberAccessType;

  if (input.languageId === "python") {
    const nextChar = nextMeaningfulCharacter(
      input.lineContent,
      input.startColumnZeroBased + input.identifier.length,
    );
    const scopedPythonType =
      hasScope(input.scopeNames, "meta.attribute.python")
        ? "property"
        : hasScope(input.scopeNames, "variable.parameter.function.language.python")
          ? "parameter"
          : hasScope(input.scopeNames, "variable.language.special.self.python")
            ? "selfKeyword"
            : hasScope(input.scopeNames, "meta.function-call.python") &&
                nextChar === "("
              ? isClassLikeIdentifier(input.identifier)
                ? "constructor"
                : "function"
              : null;
    return scopedPythonType ?? resolvePythonFallbackTokenType(
      input.lineContent,
      input.identifier,
      input.startColumnZeroBased,
    );
  }

  return null;
}

export function resolveContextualTokenType(input: {
  baseTokenType: string;
  languageId: string;
  lineContent: string;
  identifier: string;
  startColumnZeroBased: number;
}) {
  if (
    input.languageId === "python" &&
    input.baseTokenType === "string" &&
    nextMeaningfulCharacter(
      input.lineContent,
      input.startColumnZeroBased + input.identifier.length,
    ) === ":"
  ) {
    // TextMate's Python grammar gives quoted dictionary keys the same string
    // scope as their values. The following colon is the structural distinction
    // available at tokenization time, so promote only that exact shape to a
    // property. Ordinary strings keep string coloring, including values in the
    // same dictionary and strings used elsewhere in Python expressions.
    return "property";
  }

  const memberAccessType = resolveMemberAccessTokenType(input);
  if (memberAccessType && input.baseTokenType === "variable") {
    return memberAccessType;
  }
  return input.baseTokenType;
}

function pushFallbackIdentifierTokens(input: {
  data: number[];
  languageId: string;
  lineContent: string;
  lineIndex: number;
  relativeState: { line: number; character: number };
  explanationContent: string;
  explanationStartColumnZeroBased: number;
  scopeNames: string[];
}) {
  const identifierPattern = /[A-Za-z_][A-Za-z0-9_]*/g;
  let match: RegExpExecArray | null;
  while ((match = identifierPattern.exec(input.explanationContent))) {
    const identifier = match[0];
    const startColumnZeroBased =
      input.explanationStartColumnZeroBased + match.index;
    const tokenType = resolveFallbackTokenType({
      languageId: input.languageId,
      lineContent: input.lineContent,
      identifier,
      startColumnZeroBased,
      scopeNames: input.scopeNames,
    });
    if (!tokenType) continue;

    // Some TextMate grammars, Python in particular, leave import aliases and
    // call targets as plain `source.*` text. Rather than making every unknown
    // identifier colorful, this fallback only promotes identifiers whose local
    // syntax context is unambiguous enough to avoid noisy false positives.
    pushRelativeToken(input.data, input.relativeState, {
      line: input.lineIndex,
      character: startColumnZeroBased,
      length: identifier.length,
      tokenType,
      tokenModifiers: 0,
    });
  }
}

export function resolveTextMateTokenType(scopeNames: string[]) {
  if (startsWithScope(scopeNames, "comment")) return "comment";
  if (hasScope(scopeNames, "entity.name.tag.yaml")) return "property";
  // JSON object keys are lexically quoted strings, but semantically they are
  // properties. This structural scope must win before the generic string branch
  // or every key receives the same color as a string value.
  if (
    hasScope(scopeNames, "support.type.property-name.json") ||
    hasScope(scopeNames, "string.key.json") ||
    hasScope(scopeNames, "key.json")
  ) {
    return "property";
  }
  if (
    hasScope(scopeNames, "punctuation.separator.key-value.mapping.yaml") ||
    hasScope(scopeNames, "punctuation.definition.block.sequence.item.yaml")
  ) {
    return "operator";
  }
  if (hasScope(scopeNames, "constant.language.boolean.yaml")) return "keyword";
  // YAML keys carry both `string.unquoted.*` and `entity.name.tag.yaml`.
  // Structural scopes must be handled before generic strings or every key
  // collapses back to normal text coloring.
  if (startsWithScope(scopeNames, "string")) return "string";
  if (
    hasScope(scopeNames, "storage.type.class.python") ||
    hasScope(scopeNames, "storage.type.function.python")
  ) {
    return "keyword";
  }
  if (hasScope(scopeNames, "variable.language.special.self.python")) {
    return "selfKeyword";
  }
  if (hasScope(scopeNames, "constant.numeric")) return "number";
  if (hasScope(scopeNames, "keyword.operator")) return "operator";
  if (startsWithScope(scopeNames, "keyword")) return "keyword";
  if (hasScope(scopeNames, "storage.modifier")) return "modifier";
  if (hasScope(scopeNames, "entity.name.function.constructor")) return "constructor";
  if (hasScope(scopeNames, "entity.name.function")) return "function";
  if (hasScope(scopeNames, "support.function")) return "function";
  if (hasScope(scopeNames, "entity.name.method")) return "method";
  if (hasScope(scopeNames, "variable.parameter")) return "parameter";
  if (hasScope(scopeNames, "entity.name.class")) return "class";
  if (hasScope(scopeNames, "support.class")) return "class";
  if (hasScope(scopeNames, "entity.name.interface")) return "interface";
  if (hasScope(scopeNames, "entity.name.enum")) return "enum";
  if (hasScope(scopeNames, "entity.name.type.alias")) return "typeAlias";
  if (hasScope(scopeNames, "entity.name.type")) return "type";
  if (hasScope(scopeNames, "support.type.primitive")) return "builtinType";
  if (hasScope(scopeNames, "support.type")) return "type";
  if (hasScope(scopeNames, "storage.type")) return "type";
  if (hasScope(scopeNames, "entity.name.tag")) return "tag";
  if (hasScope(scopeNames, "entity.other.attribute-name")) return "attribute";
  if (hasScope(scopeNames, "meta.jsx.children")) return "text";
  if (hasScope(scopeNames, "punctuation.definition.tag")) return "operator";
  if (hasScope(scopeNames, "variable.other.property")) return "property";
  if (hasScope(scopeNames, "variable.other.object.property")) return "property";
  if (hasScope(scopeNames, "meta.object-literal.key")) return "property";
  if (hasScope(scopeNames, "support.variable.property")) return "property";
  if (hasScope(scopeNames, "constant.language")) return "variable";
  if (hasScope(scopeNames, "variable.other.constant")) return "variable";
  if (startsWithScope(scopeNames, "variable")) return "variable";
  if (startsWithScope(scopeNames, "constant")) return "variable";
  if (startsWithScope(scopeNames, "storage")) return "keyword";
  return null;
}

function resolveTokenModifiers(scopeNames: string[]) {
  let modifiers = 0;
  if (
    hasScope(scopeNames, "keyword.control.import") ||
    hasScope(scopeNames, "keyword.operator.expression.import")
  ) {
    modifiers |= 1 << (tokenModifierIndexes.get("import") ?? 0);
  }
  if (hasScope(scopeNames, "variable.other.constant")) {
    modifiers |= 1 << (tokenModifierIndexes.get("readonly") ?? 0);
  }
  if (hasScope(scopeNames, "constant.language")) {
    modifiers |= 1 << (tokenModifierIndexes.get("builtin") ?? 0);
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
  const language = textMateLanguages.get(input.languageId);
  if (!language) return null;

  const highlighter = await getHighlighter(language);
  if (!highlighter) return null;

  const lineStarts = createLineStarts(input.content);
  const lineContents = input.content.split(/\n/);
  const tokenData: number[] = [];
  const relativeState = { line: 0, character: 0 };

  // Shiki supplies the same TextMate scope stack VS Code themes are built
  // around. I only use it as a structural tokenizer here; Axon's active theme
  // still decides the final colors through Monaco semanticTokenColors. This
  // keeps grammar richness independent from the temporary tokenizer theme used
  // to make Shiki emit scope explanations.
  const shikiTokens = highlighter.codeToTokens(input.content, {
    lang: language.id,
    theme: "github-dark",
    includeExplanation: true,
    tokenizeTimeLimit: 120,
    tokenizeMaxLineLength: 30_000,
  });

  shikiTokens.tokens.forEach((lineTokens, lineIndex) => {
    const lineStart = lineStarts[lineIndex] ?? 0;
    const lineContent = lineContents[lineIndex] ?? "";

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
        const tokenType = resolveTextMateTokenType(scopeNames);
        const startColumnZeroBased =
          explanationOffset - lineStart + trimmedStart;
        if (!tokenType) {
          pushFallbackIdentifierTokens({
            data: tokenData,
            languageId: input.languageId,
            lineContent,
            lineIndex,
            relativeState,
            explanationContent: content,
            explanationStartColumnZeroBased: explanationOffset - lineStart,
            scopeNames,
          });
          explanationOffset += content.length;
          return;
        }
        const contextualTokenType = resolveContextualTokenType({
          baseTokenType: tokenType,
          languageId: input.languageId,
          lineContent,
          identifier: content.slice(trimmedStart, visibleLength),
          startColumnZeroBased,
        });

        pushRelativeToken(tokenData, relativeState, {
          line: lineIndex,
          character: startColumnZeroBased,
          length: tokenLength,
          tokenType: contextualTokenType,
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
