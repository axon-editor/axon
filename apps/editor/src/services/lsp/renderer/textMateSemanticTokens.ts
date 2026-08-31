import {
  semanticCaptureCandidates,
  type HighlightToken,
  type HighlightTokenSet,
} from "./highlightTokenMerge";

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
  [
    "typescript",
    { id: "typescript", load: () => import("shiki/langs/typescript.mjs") },
  ],
  ["typescriptreact", { id: "tsx", load: () => import("shiki/langs/tsx.mjs") }],
  [
    "javascript",
    { id: "javascript", load: () => import("shiki/langs/javascript.mjs") },
  ],
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
  [
    "dockerfile",
    { id: "dockerfile", load: () => import("shiki/langs/dockerfile.mjs") },
  ],
  ["xml", { id: "xml", load: () => import("shiki/langs/xml.mjs") }],
  ["proto", { id: "proto", load: () => import("shiki/langs/proto.mjs") }],
  ["swift", { id: "swift", load: () => import("shiki/langs/swift.mjs") }],
  ["ruby", { id: "ruby", load: () => import("shiki/langs/ruby.mjs") }],
  ["dart", { id: "dart", load: () => import("shiki/langs/dart.mjs") }],
  ["sql", { id: "sql", load: () => import("shiki/langs/sql.mjs") }],
  ["toml", { id: "toml", load: () => import("shiki/langs/toml.mjs") }],
  ["zig", { id: "zig", load: () => import("shiki/langs/zig.mjs") }],
  ["terraform", { id: "hcl", load: () => import("shiki/langs/hcl.mjs") }],
  ["hcl", { id: "hcl", load: () => import("shiki/langs/hcl.mjs") }],
  ["latex", { id: "latex", load: () => import("shiki/langs/latex.mjs") }],
  ["bibtex", { id: "bibtex", load: () => import("shiki/langs/bibtex.mjs") }],
  ["scala", { id: "scala", load: () => import("shiki/langs/scala.mjs") }],
  ["clojure", { id: "clojure", load: () => import("shiki/langs/clojure.mjs") }],
  ["haskell", { id: "haskell", load: () => import("shiki/langs/haskell.mjs") }],
  ["erlang", { id: "erlang", load: () => import("shiki/langs/erlang.mjs") }],
  ["r", { id: "r", load: () => import("shiki/langs/r.mjs") }],
  [
    "powershell",
    { id: "powershell", load: () => import("shiki/langs/powershell.mjs") },
  ],
  ["asm", { id: "asm", load: () => import("shiki/langs/asm.mjs") }],
  [
    "makefile",
    { id: "makefile", load: () => import("shiki/langs/makefile.mjs") },
  ],
]);
let highlighterFoundationPromise: Promise<{
  shiki: ShikiModule;
  engine: unknown;
  theme: unknown;
}> | null = null;
const highlighterPromises = new Map<string, Promise<ShikiHighlighter | null>>();
let highlighterLoadError: string | null = null;
let highlighterLoadWarningShown = false;
let tokenizationWarningShown = false;

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

export function preloadTextMateLanguage(languageId: string) {
  const language = textMateLanguages.get(languageId);
  return language
    ? getHighlighter(language).then(() => undefined)
    : Promise.resolve();
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
  const previousChar = previousMeaningfulCharacter(
    lineContent,
    startColumnZeroBased,
  );
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
    const scopedPythonType = hasScope(input.scopeNames, "meta.attribute.python")
      ? "property"
      : hasScope(
            input.scopeNames,
            "variable.parameter.function.language.python",
          )
        ? "parameter"
        : hasScope(input.scopeNames, "variable.language.special.self.python")
          ? "selfKeyword"
          : hasScope(input.scopeNames, "meta.function-call.python") &&
              nextChar === "("
            ? isClassLikeIdentifier(input.identifier)
              ? "constructor"
              : "function"
            : null;
    return (
      scopedPythonType ??
      resolvePythonFallbackTokenType(
        input.lineContent,
        input.identifier,
        input.startColumnZeroBased,
      )
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
  tokens: HighlightToken[];
  languageId: string;
  lineContent: string;
  lineIndex: number;
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
    pushHighlightToken(input.tokens, {
      line: input.lineIndex,
      character: startColumnZeroBased,
      length: identifier.length,
      tokenType,
      modifiers: [],
      captureCandidates: semanticCaptureCandidates(
        tokenType,
        [],
        input.languageId,
      ),
      source: "fallback",
      languageId: input.languageId,
      scopeNames: input.scopeNames,
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
  if (hasScope(scopeNames, "regexp") || hasScope(scopeNames, "regex")) {
    return "regexp";
  }
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
  if (hasScope(scopeNames, "entity.name.function.preprocessor")) return "macro";
  if (hasScope(scopeNames, "entity.name.function.constructor"))
    return "constructor";
  if (hasScope(scopeNames, "entity.name.function")) return "function";
  if (hasScope(scopeNames, "support.function")) return "function";
  if (hasScope(scopeNames, "entity.name.method")) return "method";
  if (hasScope(scopeNames, "variable.parameter")) return "parameter";
  if (hasScope(scopeNames, "entity.name.class")) return "class";
  if (hasScope(scopeNames, "support.class")) return "class";
  if (hasScope(scopeNames, "entity.name.interface")) return "interface";
  if (hasScope(scopeNames, "entity.name.enum")) return "enum";
  if (hasScope(scopeNames, "variable.other.enummember")) return "enumMember";
  if (
    hasScope(scopeNames, "entity.name.package") ||
    hasScope(scopeNames, "entity.name.type.package")
  ) {
    return "namespace";
  }
  if (hasScope(scopeNames, "entity.name.type.alias")) return "typeAlias";
  if (hasScope(scopeNames, "entity.name.type")) return "type";
  if (hasScope(scopeNames, "support.type.primitive")) return "builtinType";
  if (hasScope(scopeNames, "support.type")) return "type";
  if (hasScope(scopeNames, "storage.type")) return "type";
  if (hasScope(scopeNames, "entity.name.tag")) return "tag";
  if (hasScope(scopeNames, "entity.other.attribute-name")) return "attribute";
  if (hasScope(scopeNames, "entity.name.namespace")) return "namespace";
  if (hasScope(scopeNames, "entity.name.module")) return "namespace";
  if (hasScope(scopeNames, "entity.name.decorator")) return "decorator";
  if (hasScope(scopeNames, "meta.jsx.children")) return "text";
  if (hasScope(scopeNames, "punctuation.definition.tag")) return "operator";
  if (startsWithScope(scopeNames, "punctuation")) return "operator";
  if (hasScope(scopeNames, "variable.other.property")) return "property";
  if (hasScope(scopeNames, "variable.other.object.property")) return "property";
  if (hasScope(scopeNames, "meta.object-literal.key")) return "property";
  if (hasScope(scopeNames, "support.variable.property")) return "property";
  if (hasScope(scopeNames, "constant.language")) return "variable";
  if (hasScope(scopeNames, "constant.other")) return "variable";
  if (hasScope(scopeNames, "variable.other.constant")) return "variable";
  if (startsWithScope(scopeNames, "variable")) return "variable";
  if (startsWithScope(scopeNames, "constant")) return "variable";
  if (startsWithScope(scopeNames, "storage")) return "keyword";
  if (startsWithScope(scopeNames, "markup")) return "text";
  return null;
}

function resolveTokenModifiers(scopeNames: string[]) {
  const modifiers: string[] = [];
  if (
    hasScope(scopeNames, "keyword.control.import") ||
    hasScope(scopeNames, "keyword.operator.expression.import")
  ) {
    modifiers.push("import");
  }
  if (hasScope(scopeNames, "variable.other.constant")) {
    modifiers.push("readonly");
  }
  if (hasScope(scopeNames, "constant.language")) {
    modifiers.push("builtin");
  }
  if (hasScope(scopeNames, "variable.language")) {
    modifiers.push("defaultLibrary");
  }
  if (hasScope(scopeNames, "support.")) {
    modifiers.push("defaultLibrary");
  }
  if (hasScope(scopeNames, "meta.definition")) {
    modifiers.push("declaration");
  }
  return [...new Set(modifiers)];
}

function pushHighlightToken(tokens: HighlightToken[], token: HighlightToken) {
  if (token.length <= 0 || token.captureCandidates.length === 0) return;
  tokens.push(token);
}

export function resolveTextMateCaptureCandidates(input: {
  scopeNames: string[];
  tokenType: string;
  languageId: string;
  lineContent: string;
  identifier: string;
  startColumnZeroBased: number;
}) {
  const candidates: string[] = [];
  const { scopeNames } = input;
  const nextCharacter = nextMeaningfulCharacter(
    input.lineContent,
    input.startColumnZeroBased + input.identifier.length,
  );
  const previousCharacter = previousMeaningfulCharacter(
    input.lineContent,
    input.startColumnZeroBased,
  );
  // A dot normally promotes the following identifier to a property or method,
  // but qualified type names such as `http.ResponseWriter` already have stronger
  // grammar identity. Preserving that type prevents the generic member rule from
  // repainting the real type name as a property while its qualifier is neutral.
  const qualifiedType =
    previousCharacter === "." &&
    [
      "type",
      "typeAlias",
      "typeParameter",
      "class",
      "interface",
      "enum",
      "builtinType",
    ].includes(input.tokenType);

  if (startsWithScope(scopeNames, "comment.block.documentation")) {
    candidates.push("comment.doc");
  }
  if (
    hasScope(scopeNames, "string.quoted.docstring") ||
    hasScope(scopeNames, "string.documentation")
  ) {
    candidates.push("string.documentation", "string.doc");
  }
  if (hasScope(scopeNames, "constant.language.boolean")) {
    candidates.push("boolean", "constant.builtin");
  } else if (hasScope(scopeNames, "constant.language")) {
    candidates.push("constant.builtin", "constant");
  }
  if (hasScope(scopeNames, "constant.numeric.float")) {
    candidates.push("number.float", "float");
  }
  if (hasScope(scopeNames, "constant.character.escape")) {
    candidates.push("string.escape", "character.special");
  }
  if (hasScope(scopeNames, "regexp") || hasScope(scopeNames, "regex")) {
    candidates.push("string.regex", "string.regexp");
  }
  if (hasScope(scopeNames, "string.special.path")) {
    candidates.push("string.special.path");
  } else if (hasScope(scopeNames, "string.special")) {
    candidates.push("string.special");
  }
  if (
    hasScope(scopeNames, "support.type.property-name.json") ||
    hasScope(scopeNames, "string.key.json") ||
    hasScope(scopeNames, "key.json")
  ) {
    candidates.push("property.json_key", "property");
  }
  if (hasScope(scopeNames, "keyword.control.import")) {
    candidates.push("keyword.import", "import");
  }
  if (hasScope(scopeNames, "keyword.control.export")) {
    candidates.push("keyword.export");
  }
  if (hasScope(scopeNames, "keyword.control.return")) {
    candidates.push("keyword.return");
  }
  if (hasScope(scopeNames, "keyword.control.conditional")) {
    candidates.push("keyword.conditional");
  }
  if (hasScope(scopeNames, "keyword.control.repeat")) {
    candidates.push("keyword.repeat");
  }
  if (hasScope(scopeNames, "keyword.control.exception")) {
    candidates.push("keyword.exception");
  }
  if (
    hasScope(scopeNames, "keyword.control") &&
    hasScope(scopeNames, "return")
  ) {
    candidates.push("keyword.return");
  }
  if (hasScope(scopeNames, "meta.preprocessor")) {
    candidates.push("preproc", "keyword.directive");
  }
  if (hasScope(scopeNames, "entity.name.function.preprocessor")) {
    candidates.push("function.macro", "constant.macro");
  }
  if (hasScope(scopeNames, "entity.name.function.constructor")) {
    candidates.push("constructor");
  } else if (
    hasScope(scopeNames, "entity.name.method") ||
    hasScope(scopeNames, "meta.method") ||
    (previousCharacter === "." && nextCharacter === "(" && !qualifiedType)
  ) {
    candidates.push(
      nextCharacter === "(" ? "function.method.call" : "function.method",
    );
  } else if (previousCharacter === "." && !qualifiedType) {
    candidates.push("property", "variable.member");
  } else if (
    input.tokenType === "function" &&
    (nextCharacter === "(" || hasScope(scopeNames, "meta.function-call"))
  ) {
    candidates.push("function.call");
  }
  if (
    input.tokenType === "function" &&
    (hasScope(scopeNames, "meta.definition") ||
      hasScope(scopeNames, "meta.function.declaration"))
  ) {
    candidates.unshift("function.definition");
  }
  if (
    input.tokenType === "class" &&
    (hasScope(scopeNames, "meta.definition") ||
      hasScope(scopeNames, "meta.class"))
  ) {
    candidates.unshift("type.class.definition");
  }
  const bracketToken = /^[()[\]{}]+$/.test(input.identifier);
  if (hasScope(scopeNames, "punctuation.definition.tag")) {
    candidates.push("tag.delimiter", "punctuation.bracket");
  } else if (bracketToken || hasScope(scopeNames, "punctuation.section")) {
    candidates.push("punctuation.bracket");
  } else if (hasScope(scopeNames, "punctuation.separator")) {
    candidates.push("punctuation.delimiter");
  } else if (startsWithScope(scopeNames, "punctuation")) {
    candidates.push("punctuation");
  }
  if (
    hasScope(scopeNames, "entity.name.package") ||
    hasScope(scopeNames, "entity.name.type.package")
  ) {
    candidates.unshift("namespace", "module");
  }
  if (
    input.languageId === "go" &&
    nextCharacter === "." &&
    /^[A-Za-z_]\w*$/.test(input.identifier)
  ) {
    // Go's TextMate grammar scopes `http` as a type in type expressions and as
    // a variable in calls, even though both positions are the package side of a
    // selector. The following dot is the stable boundary, so the qualifier gets
    // namespace identity while the identifier after the dot keeps its own type,
    // method, property, or constant capture.
    candidates.unshift("namespace", "module");
  }
  if (hasScope(scopeNames, "entity.other.attribute-name")) {
    candidates.push("tag.attribute", "attribute");
  }

  candidates.push(
    ...semanticCaptureCandidates(
      input.tokenType,
      resolveTokenModifiers(scopeNames),
      input.languageId,
    ),
  );
  return [...new Set(candidates)];
}

export async function createTextMateSemanticTokens(input: {
  languageId: string;
  content: string;
}): Promise<HighlightTokenSet | null> {
  const language = textMateLanguages.get(input.languageId);
  if (!language) return null;

  const highlighter = await getHighlighter(language);
  if (!highlighter) return null;

  const lineStarts = createLineStarts(input.content);
  const lineContents = input.content.split(/\n/);
  const highlightTokens: HighlightToken[] = [];

  // Shiki's temporary theme exists only to make the grammar return explanation
  // scopes. I retain those scopes and derive ordered Axon capture candidates;
  // the active editor theme resolves their final style later. Keeping grammar
  // identity separate from the temporary Shiki palette prevents GitHub Dark
  // from leaking into the UI and lets a theme distinguish a method call from a
  // declaration without retokenizing the document for every theme switch.
  let shikiTokens: ReturnType<ShikiHighlighter["codeToTokens"]>;
  try {
    shikiTokens = highlighter.codeToTokens(input.content, {
      lang: language.id,
      theme: "github-dark",
      includeExplanation: true,
      // Shiki measures elapsed wall time, so a tiny file can exhaust the same
      // budget as a genuinely expensive file when the machine is busy with a
      // build or multiple editor workers. Small documents are safe to give a
      // wider window; larger files keep the strict limit that prevents syntax
      // enrichment from blocking the renderer for an unbounded period.
      tokenizeTimeLimit: input.content.length <= 10_000 ? 500 : 120,
      tokenizeMaxLineLength: 30_000,
    });
  } catch (err) {
    // TextMate enrichment is an optional layer above Monaco and LSP tokens. A
    // grammar timeout or malformed third-party capture must fall back to those
    // stable layers instead of rejecting the entire semantic-token request and
    // leaving the editor without updated coloring.
    if (!tokenizationWarningShown) {
      tokenizationWarningShown = true;
      console.warn(
        `[syntax] TextMate tokenization failed for ${input.languageId}:`,
        describeError(err),
      );
    }
    return null;
  }

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
        const visibleLength = trimmedEnd >= 0 ? trimmedEnd : content.length;
        const tokenLength = visibleLength - trimmedStart;
        const scopeNames = getScopeNames(explanation.scopes);
        const tokenType = resolveTextMateTokenType(scopeNames);
        const startColumnZeroBased =
          explanationOffset - lineStart + trimmedStart;
        if (!tokenType) {
          pushFallbackIdentifierTokens({
            tokens: highlightTokens,
            languageId: input.languageId,
            lineContent,
            lineIndex,
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

        const modifiers = resolveTokenModifiers(scopeNames);
        pushHighlightToken(highlightTokens, {
          line: lineIndex,
          character: startColumnZeroBased,
          length: tokenLength,
          tokenType: contextualTokenType,
          modifiers,
          captureCandidates: resolveTextMateCaptureCandidates({
            scopeNames,
            tokenType: contextualTokenType,
            languageId: input.languageId,
            lineContent,
            identifier: content.slice(trimmedStart, visibleLength),
            startColumnZeroBased,
          }),
          source: "textmate",
          languageId: input.languageId,
          scopeNames,
        });
        explanationOffset += content.length;
      });
    });
  });

  return highlightTokens.length > 0 ? { tokens: highlightTokens } : null;
}
