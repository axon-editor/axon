import * as monaco from "monaco-editor";
import { type ThemeTokenMap } from "../../../renderer/shared/themes/types";
import { type ExtensionThemeSyntaxStyle } from "../../../shared/extensions";
import { getSemanticTokensForModel } from "./lspSemanticTokens";
import {
  createCaptureStyleMap,
  createDefaultCaptureEntries,
  resolveCaptureStyle,
  type SyntaxStyle,
} from "../../../renderer/shared/themes/captureRegistry";
import { createExtensionSyntaxThemeEntries } from "../../../renderer/shared/themes/syntaxTheme";
import { type HighlightToken } from "./highlightTokenMerge";

export const RICH_SEMANTIC_DECORATION_LANGUAGES = new Set([
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
  "go",
  "rust",
  "python",
]);

const SEMANTIC_STYLE_ELEMENT_ID = "axon-semantic-token-decoration-styles";
export function semanticClassName(capture: string) {
  let hash = 2166136261;
  for (let index = 0; index < capture.length; index += 1) {
    hash ^= capture.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `axon-sem-${(hash >>> 0).toString(36)}`;
}

function resolveTokenEndPosition(
  model: monaco.editor.ITextModel,
  lineNumber: number,
  column: number,
  length: number,
) {
  let remaining = length;
  let currentLine = lineNumber;
  let currentColumn = column;

  while (remaining > 0 && currentLine <= model.getLineCount()) {
    const lineLength = model.getLineMaxColumn(currentLine) - 1;
    const remainingOnLine = Math.max(0, lineLength - currentColumn + 1);
    if (remaining <= remainingOnLine) {
      return {
        lineNumber: currentLine,
        column: currentColumn + remaining,
      };
    }

    remaining -= remainingOnLine + 1;
    currentLine += 1;
    currentColumn = 1;
  }

  return {
    lineNumber: Math.min(currentLine, model.getLineCount()),
    column: model.getLineMaxColumn(Math.min(currentLine, model.getLineCount())),
  };
}

export function installSemanticTokenDecorationStyles(
  tokens: ThemeTokenMap,
  syntax: Record<string, ExtensionThemeSyntaxStyle> = {},
) {
  const entries = [
    ...createDefaultCaptureEntries(tokens),
    ...createExtensionSyntaxThemeEntries(syntax),
  ];
  const styles = createCaptureStyleMap(entries);
  let styleElement = document.getElementById(SEMANTIC_STYLE_ELEMENT_ID);
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = SEMANTIC_STYLE_ELEMENT_ID;
    document.head.appendChild(styleElement);
  }

  styleElement.textContent = [...styles.keys()]
    .map((capture) => {
      const resolved = resolveCaptureStyle(capture, styles);
      if (!resolved) return "";
      return createCaptureCssRule(resolved.capture, resolved.style);
    })
    .filter(Boolean)
    .join("\n");
}

function safeFontWeight(value: number | string | undefined) {
  if (typeof value === "number" && value >= 1 && value <= 1_000) {
    return String(value);
  }
  if (
    typeof value === "string" &&
    /^(normal|bold|lighter|bolder|[1-9]00)$/.test(value)
  ) {
    return value;
  }
  return null;
}

function createCaptureCssRule(capture: string, style: SyntaxStyle) {
  const declarations: string[] = [];
  if (style.color) declarations.push(`color:${style.color} !important`);
  if (style.backgroundColor) {
    declarations.push(`background-color:${style.backgroundColor} !important`);
  }
  if (style.fontStyle === "italic" || style.fontStyle === "normal") {
    declarations.push(`font-style:${style.fontStyle} !important`);
  }
  const fontWeight = safeFontWeight(style.fontWeight);
  if (fontWeight) declarations.push(`font-weight:${fontWeight} !important`);
  const decorationLines = [
    style.underline ? "underline" : "",
    style.strikethrough ? "line-through" : "",
  ].filter(Boolean);
  if (decorationLines.length > 0) {
    declarations.push(
      `text-decoration-line:${decorationLines.join(" ")} !important`,
    );
  }
  const className = semanticClassName(capture);
  return (
    [
      `.monaco-editor .${className}`,
      `.monaco-editor .${className} span`,
      `.monaco-editor span.${className}`,
    ].join(",") + `{${declarations.join(";")};}`
  );
}

export function resolveHighlightCapture(
  token: HighlightToken,
  styles: ReadonlyMap<string, SyntaxStyle>,
) {
  let primaryFallback: ReturnType<typeof resolveCaptureStyle> = null;
  for (const candidate of token.captureCandidates) {
    const resolved = resolveCaptureStyle(candidate, styles);
    if (!resolved) continue;
    if (resolved.capture !== "primary") return resolved;
    primaryFallback ??= resolved;
  }
  return primaryFallback;
}

export async function createSemanticTokenDecorations(
  model: monaco.editor.ITextModel,
  tokens: ThemeTokenMap,
  syntax: Record<string, ExtensionThemeSyntaxStyle> = {},
) {
  const semanticTokens = await getSemanticTokensForModel(model);
  if (!semanticTokens || semanticTokens.tokens.length === 0) return [];

  const styles = createCaptureStyleMap([
    ...createDefaultCaptureEntries(tokens),
    ...createExtensionSyntaxThemeEntries(syntax),
  ]);
  const decorations: monaco.editor.IModelDeltaDecoration[] = [];
  for (const token of semanticTokens.tokens) {
    const resolved = resolveHighlightCapture(token, styles);
    if (!resolved) continue;
    const lineNumber = token.line + 1;
    const column = token.character + 1;
    const end = resolveTokenEndPosition(
      model,
      lineNumber,
      column,
      token.length,
    );
    decorations.push({
      range: new monaco.Range(lineNumber, column, end.lineNumber, end.column),
      options: {
        inlineClassName: semanticClassName(resolved.capture),
      },
    });
  }

  return decorations;
}
