import path from "path";
import { type LanguageServerFormatRequest } from "../../shared/lsp";

function resolvePrettierParser(request: LanguageServerFormatRequest) {
  const extension = path.extname(request.filePath).toLowerCase();
  const fileName = path.basename(request.filePath).toLowerCase();

  if (request.languageId === "typescriptreact" || extension === ".tsx") {
    return "typescript";
  }
  if (request.languageId === "javascriptreact" || extension === ".jsx") {
    return "babel";
  }

  if ([".ts", ".mts", ".cts"].includes(extension)) return "typescript";
  if ([".js", ".mjs", ".cjs"].includes(extension)) return "babel";
  if ([".json", ".jsonc", ".json5"].includes(extension)) return "json";
  if ([".css"].includes(extension)) return "css";
  if ([".scss", ".sass"].includes(extension)) return "scss";
  if ([".less"].includes(extension)) return "less";
  if ([".html", ".htm"].includes(extension)) return "html";
  if ([".md", ".markdown"].includes(extension)) return "markdown";
  if ([".yml", ".yaml"].includes(extension)) return "yaml";
  if (fileName === "graphql.config.js") return "babel";
  if ([".graphql", ".gql"].includes(extension)) return "graphql";

  return null;
}

function createFullDocumentEdit(originalText: string, formattedText: string) {
  const lines = originalText.split(/\r\n|\r|\n/);
  const lastLine = Math.max(0, lines.length - 1);
  const lastColumn = lines[lines.length - 1]?.length ?? 0;

  return {
    range: {
      start: { line: 0, character: 0 },
      end: { line: lastLine, character: lastColumn },
    },
    newText: formattedText,
  };
}

export async function formatWithBundledPrettier(
  request: LanguageServerFormatRequest,
) {
  const parser = resolvePrettierParser(request);
  if (!parser) {
    return null;
  }

  const prettier = await import("prettier");
  const config = await prettier
    .resolveConfig(request.filePath)
    .catch(() => null);
  const formattedText = await prettier.format(request.content, {
    ...config,
    filepath: request.filePath,
    parser,
    tabWidth: request.tabSize,
    useTabs: !request.insertSpaces,
  });

  if (formattedText === request.content) {
    return {
      ok: true,
      edits: [],
      message: "Document is already formatted.",
    };
  }

  // Prettier does not speak LSP ranges. Returning a single full-document edit
  // keeps the rest of Axon's editor pipeline unchanged: Monaco still applies an
  // ordinary text edit, dirty-state tracking still sees one model mutation, and
  // save-on-format writes the same shared model that every split pane uses.
  return {
    ok: true,
    edits: [createFullDocumentEdit(request.content, formattedText)],
    message: "Formatted with Axon's default formatter.",
  };
}
