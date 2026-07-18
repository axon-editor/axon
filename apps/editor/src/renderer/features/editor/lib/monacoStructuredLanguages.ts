import * as monaco from "monaco-editor";
import "monaco-editor/esm/vs/basic-languages/xml/xml.contribution";

const registeredMonacos = new WeakSet<typeof monaco>();

const protoKeywords = [
  "syntax",
  "package",
  "import",
  "option",
  "message",
  "enum",
  "service",
  "rpc",
  "returns",
  "stream",
  "oneof",
  "map",
  "reserved",
  "extensions",
  "extend",
  "repeated",
  "optional",
  "required",
  "public",
  "weak",
  "to",
  "max",
];

const protoTypes = [
  "double",
  "float",
  "int32",
  "int64",
  "uint32",
  "uint64",
  "sint32",
  "sint64",
  "fixed32",
  "fixed64",
  "sfixed32",
  "sfixed64",
  "bool",
  "string",
  "bytes",
];

export function registerMonacoStructuredLanguages(
  monacoInstance: typeof monaco = monaco,
) {
  if (registeredMonacos.has(monacoInstance)) return;
  registeredMonacos.add(monacoInstance);

  if (!monacoInstance.languages.getLanguages().some(({ id }) => id === "proto")) {
    monacoInstance.languages.register({
      id: "proto",
      aliases: ["Protocol Buffers", "Protobuf", "proto"],
      extensions: [".proto"],
      mimetypes: ["text/x-protobuf"],
    });
  }

  monacoInstance.languages.setLanguageConfiguration("proto", {
    comments: {
      lineComment: "//",
      blockComment: ["/*", "*/"],
    },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
      ["<", ">"],
    ],
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
    folding: {
      markers: {
        start: /^\s*\/\/\s*#?region\b/,
        end: /^\s*\/\/\s*#?endregion\b/,
      },
    },
    indentationRules: {
      increaseIndentPattern: /\{[^}"']*$/,
      decreaseIndentPattern: /^\s*\}/,
    },
  });

  // This Monarch grammar is the immediate, dependency-free first paint. The
  // TextMate/Shiki layer adds richer semantic scopes asynchronously, while this
  // layer ensures a newly opened .proto file never appears as plaintext during
  // grammar loading or when optional language-server tooling is absent.
  monacoInstance.languages.setMonarchTokensProvider("proto", {
    defaultToken: "",
    tokenPostfix: ".proto",
    keywords: protoKeywords,
    typeKeywords: protoTypes,
    tokenizer: {
      root: [
        [/[a-zA-Z_$][\w$]*/, {
          cases: {
            "@keywords": "keyword",
            "@typeKeywords": "type",
            "@default": "identifier",
          },
        }],
        { include: "@whitespace" },
        [/[{}()[\]]/, "@brackets"],
        [/[<>]/, "delimiter.angle"],
        [/[=;,.]/, "delimiter"],
        [/[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, "number"],
        [/"/, "string", "@doubleQuotedString"],
        [/'/, "string", "@singleQuotedString"],
      ],
      whitespace: [
        [/[ \t\r\n]+/, ""],
        [/\/\*/, "comment", "@comment"],
        [/\/\/.*$/, "comment"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
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
