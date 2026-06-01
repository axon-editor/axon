import ReactDOM from "react-dom/client";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import App from "./App";
import "./index.css";
import { registerAxonTheme } from "./lib/soraTheme";
import { configureMonacoDiagnostics } from "./lib/monacoDiagnostics";

loader.config({ monaco });

// I register the Axon theme against the same Monaco instance that the React
// wrapper will use. Without loader.config, @monaco-editor/react can initialize
// a separate Monaco instance, which makes the app call setTheme("axon") before
// that instance knows the custom theme exists.
registerAxonTheme(monaco);
configureMonacoDiagnostics(monaco);

// StrictMode is disabled because it double-invokes effects in development
// which causes Monaco's InstantiationService to be disposed and crash
// on the second mount. Not a concern in production.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
