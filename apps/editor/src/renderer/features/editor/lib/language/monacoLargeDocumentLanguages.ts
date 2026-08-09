import * as monaco from "monaco-editor";

export const LARGE_DOCUMENT_LANGUAGE_ID = "axon-large-document";

const registeredMonacos = new WeakSet<typeof monaco>();

export function registerMonacoLargeDocumentLanguages(
  monacoInstance: typeof monaco = monaco,
) {
  if (registeredMonacos.has(monacoInstance)) return;
  registeredMonacos.add(monacoInstance);

  monacoInstance.languages.register({
    id: LARGE_DOCUMENT_LANGUAGE_ID,
    aliases: ["Large document"],
  });
  monacoInstance.languages.setLanguageConfiguration(
    LARGE_DOCUMENT_LANGUAGE_ID,
    {
      comments: {
        lineComment: "//",
        blockComment: ["/*", "*/"],
      },
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"],
      ],
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
      ],
      surroundingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
      ],
    },
  );

  // Large files still need useful first-paint colors, but keeping their normal
  // Monaco language id also attaches that language's worker and providers.
  // This deliberately small Monarch grammar is line-oriented and lazy: Monaco
  // tokenizes visible lines as they enter the viewport instead of parsing the
  // complete document into validation, semantic-token, and decoration graphs.
  monacoInstance.languages.setMonarchTokensProvider(
    LARGE_DOCUMENT_LANGUAGE_ID,
    {
      defaultToken: "",
      tokenPostfix: ".json",
      tokenizer: {
        root: [
          [/[ \t\r\n]+/, ""],
          [/\/\*/, "comment", "@blockComment"],
          [/\/\/.*$/, "comment"],
          [/^\s*#.*$/, "comment"],
          [/"(?:[^"\\]|\\.)*"(?=\s*:)/, "string.key"],
          [/"(?:[^"\\]|\\.)*"/, "string"],
          [/'(?:[^'\\]|\\.)*'/, "string"],
          [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, "number"],
          [
            /\b(?:true|false|null|undefined|const|let|var|function|class|interface|type|enum|struct|func|def|fn|return|if|else|for|while|switch|case|import|export|from|package)\b/,
            "keyword",
          ],
          [/[{}[\]()]/, "@brackets"],
          [/[,:;.]/, "delimiter"],
        ],
        blockComment: [
          [/[^*/]+/, "comment"],
          [/\*\//, "comment", "@pop"],
          [/[*/]/, "comment"],
        ],
      },
    },
  );
}
