import ReactDOM from "react-dom/client";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/ibm-plex-sans/wght.css";
import App from "./App";
import "./index.css";
import { registerAxonTheme } from "./shared/lib/soraTheme";
import { configureMonacoDiagnostics } from "../services/lsp/renderer/monacoDiagnostics";
import { configureLspCompletions } from "../services/lsp/renderer/lspCompletions";
import { configureLspNavigation } from "../services/lsp/renderer/lspNavigation";
import { registerMonacoReactLanguages } from "./features/editor/lib/monacoReactLanguages";
import { registerMonacoStructuredLanguages } from "./features/editor/lib/monacoStructuredLanguages";
import { registerMonacoAdditionalLanguages } from "./features/editor/lib/monacoAdditionalLanguages";
import { getEnabledExtensionThemes } from "../shared/extensions";
import {
  markAxonPerformance,
  measureAxonPerformance,
} from "./shared/lib/performanceMarks";

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
    if (
      label === "typescript" ||
      label === "javascript" ||
      label === "typescriptreact" ||
      label === "javascriptreact"
    ) {
      return new TsWorker();
    }
    return new EditorWorker();
  },
};

configureMonacoDiagnostics(monaco);
registerMonacoReactLanguages(monaco);
registerMonacoStructuredLanguages(monaco);
registerMonacoAdditionalLanguages(monaco);
configureLspCompletions(monaco);
configureLspNavigation(monaco);

// The static drag strip in index.html exists before React so the window can be
// moved during the boot splash and early renderer startup. Once React is ready,
// the real toolbar/sidebar drag regions take over and the static strip must get
// out of the hit-test path so it cannot block editor controls.
document.body.classList.add("axon-react-ready");

function renderStartupFailure(err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown startup error.";
  document.getElementById("root")!.innerHTML = `
    <div style="display:flex;min-height:100vh;align-items:center;justify-content:center;background:#0d1016;color:#d8dee9;font:13px system-ui,sans-serif;padding:24px;">
      <div style="max-width:560px;border:1px solid #2d2f34;background:#1f2127;padding:18px;">
        <div style="font-weight:600;margin-bottom:8px;">Axon could not finish startup</div>
        <div style="opacity:.75;line-height:1.5;">${message.replace(/[&<>"']/g, (char) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char] ?? char)}</div>
      </div>
    </div>
  `;
}

async function boot() {
  try {
    markAxonPerformance("axon.renderer.boot.start");
    const axonApi = window.axon;
    if (!axonApi) {
      throw new Error(
        "The Electron preload API is not available. Start Axon through the desktop dev command, not the raw Vite browser URL. If this is the Electron window, restart npm run dev so dist/main and dist/preload are rebuilt.",
      );
    }

    markAxonPerformance("axon.extensions.initialList.start");
    const startupRuntimeActivation = await axonApi.activateExtensionEvent(
      "onStartup",
      null,
    );
    const initialExtensionState = startupRuntimeActivation.state;
    markAxonPerformance("axon.extensions.initialList.end", {
      count: initialExtensionState.extensions.length,
    });
    measureAxonPerformance(
      "axon.extensions.initialList",
      "axon.extensions.initialList.start",
      "axon.extensions.initialList.end",
    );
    const extensionThemes = getEnabledExtensionThemes(initialExtensionState);

    // Monaco must know the built-in extension themes before React mounts the
    // first editor. This makes extensions/builtin/themes the real startup
    // registry instead of painting once with a hard-coded renderer fallback and
    // replacing it later after IPC completes.
    registerAxonTheme(monaco, "axon-dark", undefined, extensionThemes);

    // StrictMode is disabled because it double-invokes effects in development
    // which causes Monaco's InstantiationService to be disposed and crash
    // on the second mount. Not a concern in production.
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <App initialExtensionState={initialExtensionState} />,
    );

    const finishStartup = () => {
      void axonApi
        .activateExtensionEvent("onStartupFinished", null)
        .then((result) => {
          window.dispatchEvent(
            new CustomEvent("axon:extensionState", { detail: result.state }),
          );
        })
        .catch((err) => {
          console.error("failed to finish extension activation:", err);
        });
    };
    // Contributions required for the first frame are available after onStartup.
    // Runtime-only onStartupFinished work is deferred until Chromium has painted
    // the editor shell, so extension discovery cannot hold the first usable frame.
    window.requestIdleCallback(finishStartup, { timeout: 1000 });
    markAxonPerformance("axon.renderer.react.rendered");
    measureAxonPerformance(
      "axon.renderer.boot",
      "axon.renderer.boot.start",
      "axon.renderer.react.rendered",
    );
  } catch (err) {
    console.error("failed to boot Axon:", err);
    renderStartupFailure(err);
  }
}

void boot();
