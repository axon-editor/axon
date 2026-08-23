import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

const workspaceRoot = path.resolve(__dirname, "..", "..");
const editorNodeModules = path.resolve(__dirname, "node_modules");
const workspaceNodeModules = path.resolve(workspaceRoot, "node_modules");

function dependencyPath(...segments: string[]) {
  const editorPath = path.resolve(editorNodeModules, ...segments);
  if (fs.existsSync(editorPath)) return editorPath;

  // npm may install a workspace dependency beside the app or hoist it to the
  // repository root as peer constraints change. Vitest resolves explicit
  // aliases before Node can perform that parent-directory lookup, so the test
  // configuration must support both valid npm layouts just like Vite does.
  return path.resolve(workspaceNodeModules, ...segments);
}

export default defineConfig({
  resolve: {
    alias: {
      "@axon-editor": path.resolve(__dirname, "src"),
      "@axon-builtin-code-snapshot": path.resolve(
        __dirname,
        "..",
        "..",
        "extensions",
        "builtin",
        "code-snapshot",
        "workbench",
      ),
      "@axon-builtin-markdown": path.resolve(
        __dirname,
        "..",
        "..",
        "extensions",
        "builtin",
        "markdown",
        "workbench",
      ),
      "@xterm/addon-fit": dependencyPath("@xterm", "addon-fit"),
      "@xterm/addon-web-links": dependencyPath("@xterm", "addon-web-links"),
      "@xterm/addon-webgl": dependencyPath("@xterm", "addon-webgl"),
      "@xterm/xterm": dependencyPath("@xterm", "xterm"),
      "lucide-react": path.resolve(__dirname, "node_modules", "lucide-react"),
      "react-markdown": path.resolve(
        __dirname,
        "node_modules",
        "react-markdown",
      ),
      "rehype-raw": path.resolve(__dirname, "node_modules", "rehype-raw"),
      "remark-gfm": path.resolve(__dirname, "node_modules", "remark-gfm"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
