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
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
