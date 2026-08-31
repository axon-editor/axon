import { describe, expect, it, vi } from "vitest";
import type * as Monaco from "monaco-editor";
import { configureMonacoDiagnostics } from "./monacoDiagnostics";

function createMonacoLanguageDefaults() {
  const setTypeScriptDiagnostics = vi.fn();
  const setJavaScriptDiagnostics = vi.fn();
  const setJsonDiagnostics = vi.fn();
  const monaco = {
    typescript: {
      typescriptDefaults: {
        setDiagnosticsOptions: setTypeScriptDiagnostics,
      },
      javascriptDefaults: {
        setDiagnosticsOptions: setJavaScriptDiagnostics,
      },
    },
    json: {
      jsonDefaults: {
        setDiagnosticsOptions: setJsonDiagnostics,
      },
    },
  } as unknown as typeof Monaco;

  return {
    monaco,
    setTypeScriptDiagnostics,
    setJavaScriptDiagnostics,
    setJsonDiagnostics,
  };
}

describe("Monaco diagnostics", () => {
  it("configures the top-level Monaco 0.56 language defaults once", () => {
    const defaults = createMonacoLanguageDefaults();

    configureMonacoDiagnostics(defaults.monaco);
    configureMonacoDiagnostics(defaults.monaco);

    expect(defaults.setTypeScriptDiagnostics).toHaveBeenCalledOnce();
    expect(defaults.setJavaScriptDiagnostics).toHaveBeenCalledOnce();
    expect(defaults.setJsonDiagnostics).toHaveBeenCalledOnce();
    expect(defaults.setTypeScriptDiagnostics).toHaveBeenCalledWith({
      noSyntaxValidation: true,
      noSemanticValidation: true,
      noSuggestionDiagnostics: true,
    });
    expect(defaults.setJsonDiagnostics).toHaveBeenCalledWith({
      validate: true,
      allowComments: true,
      trailingCommas: "ignore",
    });
  });
});
