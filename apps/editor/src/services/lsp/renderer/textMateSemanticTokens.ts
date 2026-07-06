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

const textMateLanguages = new Map([
  ["typescript", "typescript"],
  ["typescriptreact", "tsx"],
  ["javascript", "javascript"],
  ["javascriptreact", "jsx"],
  ["go", "go"],
  ["rust", "rust"],
  ["python", "python"],
  ["java", "java"],
  ["csharp", "csharp"],
  ["kotlin", "kotlin"],
  ["php", "php"],
  ["lua", "lua"],
  ["cpp", "cpp"],
  ["c", "c"],
  ["html", "html"],
  ["css", "css"],
  ["scss", "scss"],
  ["less", "less"],
  ["json", "json"],
  ["yaml", "yaml"],
  ["shell", "shell"],
  ["dockerfile", "dockerfile"],
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
let highlighterLoadError: string | null = null;
let highlighterLoadWarningShown = false;

function describeError(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export function getTextMateSemanticTokenStatus() {
  return {
    ready: highlighterPromise !== null && highlighterLoadError === null,
    error: highlighterLoadError,
  };
}

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = Promise.all([
      import("shiki/core"),
      import("shiki/engine/oniguruma"),
      import("@shikijs/engine-oniguruma/wasm-inlined"),
      import("shiki/langs/typescript.mjs"),
      import("shiki/langs/tsx.mjs"),
      import("shiki/langs/javascript.mjs"),
      import("shiki/langs/jsx.mjs"),
      import("shiki/langs/go.mjs"),
      import("shiki/langs/rust.mjs"),
      import("shiki/langs/python.mjs"),
      import("shiki/langs/java.mjs"),
      import("shiki/langs/csharp.mjs"),
      import("shiki/langs/kotlin.mjs"),
      import("shiki/langs/php.mjs"),
      import("shiki/langs/lua.mjs"),
      import("shiki/langs/cpp.mjs"),
      import("shiki/langs/c.mjs"),
      import("shiki/langs/html.mjs"),
      import("shiki/langs/css.mjs"),
      import("shiki/langs/scss.mjs"),
      import("shiki/langs/less.mjs"),
      import("shiki/langs/json.mjs"),
      import("shiki/langs/yaml.mjs"),
      import("shiki/langs/shell.mjs"),
      import("shiki/langs/dockerfile.mjs"),
      import("shiki/themes/github-dark.mjs"),
    ])
      .then(async ([
        coreModule,
        onigurumaModule,
        wasmModule,
        ts,
        tsx,
        js,
        jsx,
        go,
        rust,
        python,
        java,
        csharp,
        kotlin,
        php,
        lua,
        cpp,
        c,
        html,
        css,
        scss,
        less,
        json,
        yaml,
        shell,
        dockerfile,
        githubDark,
      ]) => {
        const shiki = coreModule as ShikiModule;
        const oniguruma = onigurumaModule as ShikiOnigurumaModule;
        const wasm = wasmModule as ShikiWasmModule;
        const wasmLoader = wasm.default ?? wasm.getWasmInstance;
        const engine = await oniguruma.createOnigurumaEngine(wasmLoader);
        highlighterLoadError = null;

        return shiki.createHighlighterCore({
          themes: [githubDark.default],
          langs: [
            ts.default,
            tsx.default,
            js.default,
            jsx.default,
            go.default,
            rust.default,
            python.default,
            java.default,
            csharp.default,
            kotlin.default,
            php.default,
            lua.default,
            cpp.default,
            c.default,
            html.default,
            css.default,
            scss.default,
            less.default,
            json.default,
            yaml.default,
            shell.default,
            dockerfile.default,
          ],
          engine,
        });
      })
      .catch((err) => {
        highlighterLoadError = describeError(err);

        // A failed dynamic import should not permanently flatten syntax for the
        // whole renderer session. Vite/Electron can briefly reject a lazy chunk
        // during startup or reload; clearing the cached promise lets the next
        // semantic refresh try again instead of returning `null` forever.
        highlighterPromise = null;
        if (!highlighterLoadWarningShown) {
          highlighterLoadWarningShown = true;
          console.warn(
            "[syntax] TextMate highlighter unavailable:",
            highlighterLoadError,
          );
        }
        return null;
      });
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

function resolveContextualTokenType(input: {
  baseTokenType: string;
  languageId: string;
  lineContent: string;
  identifier: string;
  startColumnZeroBased: number;
}) {
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

function resolveTokenType(scopeNames: string[]) {
  if (startsWithScope(scopeNames, "comment")) return "comment";
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
  const shikiLanguage = textMateLanguages.get(input.languageId);
  if (!shikiLanguage) return null;

  const highlighter = await getHighlighter();
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
    lang: shikiLanguage,
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
        const tokenType = resolveTokenType(scopeNames);
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
