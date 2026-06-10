import * as monaco from "monaco-editor";

type MonacoInstance = typeof monaco;

const configuredMonacos = new WeakSet<MonacoInstance>();

export function configureMonacoDiagnostics(
  monacoInstance: MonacoInstance = monaco,
) {
  if (configuredMonacos.has(monacoInstance)) return;
  configuredMonacos.add(monacoInstance);

  // Axon does not have project language servers wired yet, so Monaco's
  // standalone TypeScript worker cannot see the full workspace the way mature
  // VS Code can. Semantic diagnostics become noisy here because imports,
  // tsconfig path aliases, and framework types are missing from the worker.
  // Keeping syntax validation on still catches broken code without showing
  // false project-level errors.
  monacoInstance.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSuggestionDiagnostics: true,
  });
  monacoInstance.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSuggestionDiagnostics: true,
  });

  // Many project config files are JSON-with-comments even when their extension
  // is .json, especially tsconfig.json and jsconfig.json. Until Axon has a
  // full per-file schema registry, this avoids the misleading "comments are not
  // permitted in JSON" error that other editors usually suppress for config
  // files.
  monacoInstance.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
    trailingCommas: "ignore",
  });
}
