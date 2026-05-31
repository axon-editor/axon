import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerSoraTheme } from "./lib/soraTheme";

// register the Sora theme before the app mounts so Monaco
// has it available when the first editor instance is created
registerSoraTheme();

// StrictMode is disabled because it double-invokes effects in development
// which causes Monaco's InstantiationService to be disposed and crash
// on the second mount. Not a concern in production.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
