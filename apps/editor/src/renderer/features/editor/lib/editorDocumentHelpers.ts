import * as monaco from "monaco-editor";
import { type LanguageServerTextEdit } from "../../../../shared/lsp";

export const goCallExclusions = new Set([
  "if",
  "for",
  "switch",
  "select",
  "return",
  "defer",
  "go",
  "func",
]);

export function isMarkdown(path: string): boolean {
  return path.split(".").pop()?.toLowerCase() === "md";
}

export function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function encodeLocalPath(path: string) {
  return path
    .split(/([/\\])/)
    .map((part) =>
      part === "/" || part === "\\" ? "/" : encodeURIComponent(part),
    )
    .join("");
}

export function toMonacoEdit(edit: LanguageServerTextEdit) {
  return {
    range: new monaco.Range(
      edit.range.start.line + 1,
      edit.range.start.character + 1,
      edit.range.end.line + 1,
      edit.range.end.character + 1,
    ),
    text: edit.newText,
    forceMoveMarkers: true,
  };
}
