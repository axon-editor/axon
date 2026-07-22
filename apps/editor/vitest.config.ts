import path from "node:path";
import { defineConfig } from "vitest/config";

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
