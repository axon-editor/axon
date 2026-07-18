import * as monaco from "monaco-editor";
import "monaco-editor/esm/vs/basic-languages/clojure/clojure.contribution.js";
import "monaco-editor/esm/vs/basic-languages/dart/dart.contribution.js";
import "monaco-editor/esm/vs/basic-languages/hcl/hcl.contribution.js";
import "monaco-editor/esm/vs/basic-languages/powershell/powershell.contribution.js";
import "monaco-editor/esm/vs/basic-languages/r/r.contribution.js";
import "monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution.js";
import "monaco-editor/esm/vs/basic-languages/scala/scala.contribution.js";
import "monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js";
import "monaco-editor/esm/vs/basic-languages/swift/swift.contribution.js";

const registeredMonacos = new WeakSet<typeof monaco>();

interface AdditionalLanguage {
  id: string;
  aliases: string[];
  extensions: string[];
  filenames?: string[];
  lineComment: string;
  blockComment?: [string, string];
  keywords: string[];
}

const additionalLanguages: AdditionalLanguage[] = [
  {
    id: "makefile",
    aliases: ["Makefile", "GNU Make"],
    extensions: [".mk", ".mak", ".make"],
    filenames: ["Makefile", "GNUmakefile", "BSDmakefile"],
    lineComment: "#",
    keywords: ["define", "endef", "ifdef", "ifndef", "ifeq", "ifneq", "else", "endif", "include", "override", "export", "unexport", "private", "vpath"],
  },
  {
    id: "toml",
    aliases: ["TOML"],
    extensions: [".toml"],
    lineComment: "#",
    keywords: ["true", "false", "inf", "nan"],
  },
  {
    id: "terraform",
    aliases: ["Terraform", "HCL"],
    extensions: [".tf", ".tfvars"],
    lineComment: "#",
    blockComment: ["/*", "*/"],
    keywords: ["terraform", "resource", "data", "provider", "module", "variable", "output", "locals", "dynamic", "for", "in", "if", "true", "false", "null"],
  },
  {
    id: "zig",
    aliases: ["Zig"],
    extensions: [".zig", ".zon"],
    lineComment: "//",
    keywords: ["align", "allowzero", "and", "anyframe", "anytype", "asm", "async", "await", "break", "catch", "comptime", "const", "continue", "defer", "else", "enum", "errdefer", "error", "export", "extern", "fn", "for", "if", "inline", "noalias", "nosuspend", "opaque", "or", "orelse", "packed", "pub", "resume", "return", "linksection", "struct", "suspend", "switch", "test", "threadlocal", "try", "union", "unreachable", "usingnamespace", "var", "volatile", "while"],
  },
  {
    id: "latex",
    aliases: ["LaTeX", "TeX"],
    extensions: [".tex", ".sty", ".cls"],
    lineComment: "%",
    keywords: [],
  },
  {
    id: "bibtex",
    aliases: ["BibTeX"],
    extensions: [".bib"],
    lineComment: "%",
    keywords: ["article", "book", "booklet", "conference", "inbook", "incollection", "inproceedings", "manual", "mastersthesis", "misc", "phdthesis", "proceedings", "techreport", "unpublished"],
  },
  {
    id: "haskell",
    aliases: ["Haskell"],
    extensions: [".hs", ".lhs"],
    lineComment: "--",
    blockComment: ["{-", "-}"],
    keywords: ["as", "case", "class", "data", "default", "deriving", "do", "else", "family", "forall", "foreign", "hiding", "if", "import", "in", "infix", "infixl", "infixr", "instance", "let", "mdo", "module", "newtype", "of", "pattern", "qualified", "rec", "role", "safe", "then", "type", "unsafe", "via", "where"],
  },
  {
    id: "erlang",
    aliases: ["Erlang"],
    extensions: [".erl", ".hrl"],
    lineComment: "%",
    keywords: ["after", "begin", "case", "catch", "cond", "end", "fun", "if", "let", "maybe", "of", "query", "receive", "try", "when", "andalso", "orelse", "bnot", "not", "div", "rem", "band", "and", "bor", "bxor", "bsl", "bsr", "or", "xor"],
  },
  {
    id: "asm",
    aliases: ["Assembly", "ASM"],
    extensions: [".asm", ".s", ".inc"],
    lineComment: ";",
    keywords: ["section", "segment", "global", "extern", "bits", "default", "org", "equ", "db", "dw", "dd", "dq", "dt", "resb", "resw", "resd", "resq", "mov", "lea", "push", "pop", "call", "ret", "jmp", "cmp", "test", "add", "sub", "mul", "div", "and", "or", "xor", "not", "shl", "shr"],
  },
];

function registerAdditionalLanguage(
  monacoInstance: typeof monaco,
  language: AdditionalLanguage,
) {
  const escapedLineComment = language.lineComment.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const lineCommentPattern = new RegExp(`${escapedLineComment}[^\\n]*`);
  if (!monacoInstance.languages.getLanguages().some(({ id }) => id === language.id)) {
    monacoInstance.languages.register({
      id: language.id,
      aliases: language.aliases,
      extensions: language.extensions,
      filenames: language.filenames,
    });
  }

  monacoInstance.languages.setLanguageConfiguration(language.id, {
    comments: {
      lineComment: language.lineComment,
      blockComment: language.blockComment,
    },
    brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"', notIn: ["string", "comment"] },
      { open: "'", close: "'", notIn: ["string", "comment"] },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });

  monacoInstance.languages.setMonarchTokensProvider(language.id, {
    defaultToken: "",
    keywords: language.keywords,
    tokenizer: {
      root: [
        [/[A-Za-z_][\w-]*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
        [lineCommentPattern, "comment"],
        [/\d+(?:\.\d+)?/, "number"],
        [/"/, "string", "@doubleQuotedString"],
        [/'/, "string", "@singleQuotedString"],
        [/[{}()[\]]/, "@brackets"],
        [/[=:+*/<>!?|&.-]+/, "operator"],
      ],
      doubleQuotedString: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, "string", "@pop"],
      ],
      singleQuotedString: [
        [/[^\\']+/, "string"],
        [/\\./, "string.escape"],
        [/'/, "string", "@pop"],
      ],
    },
  });
}

export function registerMonacoAdditionalLanguages(
  monacoInstance: typeof monaco = monaco,
) {
  if (registeredMonacos.has(monacoInstance)) return;
  registeredMonacos.add(monacoInstance);
  additionalLanguages.forEach((language) => {
    registerAdditionalLanguage(monacoInstance, language);
  });
}
