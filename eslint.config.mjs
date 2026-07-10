import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    "**/dist/**",
    "**/release/**",
    "**/build/**",
    "**/public/**",
    "apps/editor/src/main/generated/**",
    "apps/editor/src/renderer/shared/themes/*Data.ts",
    "extensions/builtin/icons/**",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Axon is being migrated in buildable slices and still has legacy IPC/UI
      // boundaries that use `any`. New code should avoid it, but turning the
      // existing migration debt into thousands of warnings would make the lint
      // command unusable as a regression gate.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-empty": "off",
      "no-useless-assignment": "off",
      "preserve-caught-error": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
]);
