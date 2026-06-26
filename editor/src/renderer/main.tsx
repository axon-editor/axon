import ReactDOM from "react-dom/client";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import App from "./App";
import "./index.css";
import { registerAxonTheme } from "./shared/lib/soraTheme";
import { configureMonacoDiagnostics } from "./features/lsp/lib/monacoDiagnostics";
import { configureLspCompletions } from "./features/lsp/lib/lspCompletions";
import { configureLspNavigation } from "./features/lsp/lib/lspNavigation";

loader.config({ monaco });

// Monaco needs an explicit worker factory in Vite/Electron so the language
// services stay on their own threads. Without this, Monaco falls back to the
// main thread, which makes the editor feel laggy and produces the worker
// warning that shows up in the browser console.
(self as typeof self & {
  MonacoEnvironment?: {
    getWorker: (_: unknown, label: string) => Worker;
  };
}).MonacoEnvironment = {
  getWorker: (_: unknown, label: string) => {
    if (label === "json") return new JsonWorker();
    if (label === "css" || label === "scss" || label === "less") {
      return new CssWorker();
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new HtmlWorker();
    }
    if (label === "typescript" || label === "javascript") {
      return new TsWorker();
    }
    return new EditorWorker();
  },
};

// I register the Axon theme against the same Monaco instance that the React
// wrapper will use. Without loader.config, @monaco-editor/react can initialize
// a separate Monaco instance, which makes the app call setTheme("axon") before
// that instance knows the custom theme exists.
registerAxonTheme(monaco);
configureMonacoDiagnostics(monaco);
configureLspCompletions(monaco);
configureLspNavigation(monaco);

// The static drag strip in index.html exists before React so the window can be
// moved during the boot splash and early renderer startup. Once React is ready,
// the real toolbar/sidebar drag regions take over and the static strip must get
// out of the hit-test path so it cannot block editor controls.
document.body.classList.add("axon-react-ready");

// StrictMode is disabled because it double-invokes effects in development
// which causes Monaco's InstantiationService to be disposed and crash
// on the second mount. Not a concern in production.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
