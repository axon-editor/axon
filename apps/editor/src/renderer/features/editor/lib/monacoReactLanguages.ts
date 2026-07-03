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

  // Monaco ships TSX/JSX files under the normal TypeScript and JavaScript
  // language ids. Axon needs the React ids at the model boundary because our
  // LSP, status bar, completion providers, and diagnostics routing all treat
  // React files as a distinct script kind. Reusing Monaco's bundled tokenizer
  // keeps the editor from falling back to white/plaintext tokens while still
  // allowing the protocol layer to receive `typescriptreact`/`javascriptreact`.
  monacoInstance.languages.setMonarchTokensProvider(languageId, {
    ...baseLanguage,
    tokenPostfix: languageId === "typescriptreact" ? ".tsx" : ".jsx",
  });
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
