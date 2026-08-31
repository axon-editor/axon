declare module "monaco-editor/esm/vs/languages/definitions/typescript/typescript.js" {
  import type * as monaco from "monaco-editor";

  export const conf: monaco.languages.LanguageConfiguration;
  export const language: monaco.languages.IMonarchLanguage;
}

declare module "monaco-editor/esm/vs/languages/definitions/javascript/javascript.js" {
  import type * as monaco from "monaco-editor";

  export const conf: monaco.languages.LanguageConfiguration;
  export const language: monaco.languages.IMonarchLanguage;
}

// Monaco's registration modules are side-effect-only JavaScript files. Their
// adjacent declarations export nothing, but Monaco's package export map hides
// the physical ESM paths that Vite needs, so TypeScript requires this boundary.
declare module "monaco-editor/esm/vs/languages/definitions/*/register.js";
