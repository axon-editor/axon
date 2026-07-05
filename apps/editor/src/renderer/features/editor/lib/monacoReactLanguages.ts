import * as monaco from "monaco-editor";
import {
  conf as javascriptConfiguration,
  language as javascriptLanguage,
} from "monaco-editor/esm/vs/basic-languages/javascript/javascript";
import {
  conf as typescriptConfiguration,
  language as typescriptLanguage,
} from "monaco-editor/esm/vs/basic-languages/typescript/typescript";

const registeredMonacos = new WeakSet<typeof monaco>();

function createReactTokenizer(
  baseLanguage: monaco.languages.IMonarchLanguage,
  tokenPostfix: ".tsx" | ".jsx",
): monaco.languages.IMonarchLanguage {
  const baseTokenizer = baseLanguage.tokenizer ?? {};

  return {
    ...baseLanguage,
    tokenPostfix,
    tokenizer: {
      ...baseTokenizer,
      root: [
        [/(<\/?)([a-z][\w-]*)/, ["delimiter.angle", "tag"], "@jsxOpeningTag"],
        [
          /(<\/?)([A-Z][\w$.]*)/,
          ["delimiter.angle", "type.identifier"],
          "@jsxOpeningTag",
        ],
        ...(baseTokenizer.root ?? []),
      ],
      common: [
        [/(<\/?)([a-z][\w-]*)/, ["delimiter.angle", "tag"], "@jsxOpeningTag"],
        [
          /(<\/?)([A-Z][\w$.]*)/,
          ["delimiter.angle", "type.identifier"],
          "@jsxOpeningTag",
        ],
        ...(baseTokenizer.common ?? []),
      ],
      jsxOpeningTag: [
        [/[ \t\r\n]+/, ""],
        [/\/>/, "delimiter.angle", "@pop"],
        [/>/, "delimiter.angle", "@jsxChildren"],
        [
          /([A-Za-z_$][\w$:-]*)(\s*)(=)/,
          ["attribute.name", "", "delimiter"],
        ],
        [/[A-Za-z_$][\w$:-]*/, "attribute.name"],
        [/"/, "string", "@jsxDoubleString"],
        [/'/, "string", "@jsxSingleString"],
        [/{/, "delimiter.bracket", "@bracketCounting"],
        [/[{}]/, "delimiter.bracket"],
        [/./, ""],
      ],
      jsxChildren: [
        [/(<\/)([a-z][\w-]*)(>)/, ["delimiter.angle", "tag", "delimiter.angle"], "@pop"],
        [
          /(<\/)([A-Z][\w$.]*)(>)/,
          ["delimiter.angle", "type.identifier", "delimiter.angle"],
          "@pop",
        ],
        [/(<\/?)([a-z][\w-]*)/, ["delimiter.angle", "tag"], "@jsxOpeningTag"],
        [
          /(<\/?)([A-Z][\w$.]*)/,
          ["delimiter.angle", "type.identifier"],
          "@jsxOpeningTag",
        ],
        [/{/, "delimiter.bracket", "@bracketCounting"],
        // JSX children are user-visible text nodes, not string literals. If we
        // color them as strings, normal copy inside tags such as
        // `<p>Need Custom Software?</p>` inherits the string color and looks
        // like code. The dedicated text token lets Axon's capture layer keep
        // prose on the normal editor foreground while tags and attributes stay
        // richly colored.
        [/[^<>{}]+/, "text"],
        [/[{}]/, "delimiter.bracket"],
      ],
      jsxDoubleString: [
        [/[^"\\]+/, "string"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/"/, "string", "@pop"],
      ],
      jsxSingleString: [
        [/[^'\\]+/, "string"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/'/, "string", "@pop"],
      ],
    },
  };
}

function registerReactLanguage(
  monacoInstance: typeof monaco,
  languageId: "typescriptreact" | "javascriptreact",
  baseLanguage: monaco.languages.IMonarchLanguage,
  baseConfiguration: monaco.languages.LanguageConfiguration,
) {
  const existingLanguage = monacoInstance.languages
    .getLanguages()
    .some((language) => language.id === languageId);

  if (!existingLanguage) {
    monacoInstance.languages.register({
      id: languageId,
      aliases:
        languageId === "typescriptreact"
          ? ["TypeScript React", "TSX", "tsx"]
          : ["JavaScript React", "JSX", "jsx"],
      extensions: languageId === "typescriptreact" ? [".tsx"] : [".jsx"],
    });
  }

  monacoInstance.languages.setLanguageConfiguration(
    languageId,
    baseConfiguration,
  );

  // Monaco's bundled TS/JS tokenizers do not expose JSX as its own language id.
  // Axon does need those ids because the LSP, completion, navigation, and status
  // plumbing all distinguish React files from plain scripts. I layer a focused
  // JSX tokenizer over Monaco's normal TypeScript/JavaScript rules so embedded
  // HTML tags and attributes receive real scopes instead of being painted as
  // generic identifiers while the rest of the document still uses Monaco's
  // mature script tokenizer.
  monacoInstance.languages.setMonarchTokensProvider(
    languageId,
    createReactTokenizer(
      baseLanguage,
      languageId === "typescriptreact" ? ".tsx" : ".jsx",
    ),
  );
}

export function registerMonacoReactLanguages(
  monacoInstance: typeof monaco = monaco,
) {
  if (registeredMonacos.has(monacoInstance)) return;
  registeredMonacos.add(monacoInstance);

  registerReactLanguage(
    monacoInstance,
    "typescriptreact",
    typescriptLanguage,
    typescriptConfiguration,
  );
  registerReactLanguage(
    monacoInstance,
    "javascriptreact",
    javascriptLanguage,
    javascriptConfiguration,
  );
}
