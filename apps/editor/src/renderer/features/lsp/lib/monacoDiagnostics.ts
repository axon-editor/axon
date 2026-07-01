import * as monaco from "monaco-editor";

type MonacoInstance = typeof monaco;

const configuredMonacos = new WeakSet<MonacoInstance>();

export function configureMonacoDiagnostics(
  monacoInstance: MonacoInstance = monaco,
) {
  if (configuredMonacos.has(monacoInstance)) return;
  configuredMonacos.add(monacoInstance);

  // Axon now uses project language servers for TypeScript and JavaScript, so
  // Monaco's standalone worker should not produce editor diagnostics for those
  // languages at all. The standalone worker cannot fully reproduce tsconfig
  // project references, generated types, path aliases, framework plugins, or
  // the same module graph the LSP sees, so it can show errors in Axon that do
  // not exist in Zed/VS Code. LSP remains the source of truth for Problems,
  // squiggles, hover, and quick fixes.
  monacoInstance.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSyntaxValidation: true,
    noSemanticValidation: true,
    noSuggestionDiagnostics: true,
  });
  monacoInstance.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSyntaxValidation: true,
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
