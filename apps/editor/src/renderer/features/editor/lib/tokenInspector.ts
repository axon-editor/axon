import * as monaco from "monaco-editor";
import { type ThemeTokenMap } from "../../../shared/themes";
import { type ExtensionThemeSyntaxStyle } from "../../../../shared/extensions";
import {
  createDefaultCaptureEntries,
  findCapturesForMonacoToken,
  resolveCaptureStyleForInspector,
  type AxonTokenCaptureMatch,
} from "../../../shared/themes/captureRegistry";
import { createExtensionSyntaxThemeEntries } from "../../../shared/themes/syntaxTheme";

export interface TokenInspectorCapture {
  capture: string;
  matchedToken: string;
  match: "exact" | "prefix";
  expectedColor: string | null;
  fontStyle: string | null;
}

export interface TokenInspectorReport {
  filePath: string;
  languageId: string;
  line: number;
  column: number;
  tokenText: string;
  word: string;
  modelTokenClassName: string;
  modelTokenLanguage: string;
  modelTokenType: string;
  inferredMonacoToken: string;
  inferredTokenLanguage: string;
  inferenceSource: "model" | "standalone-line";
  tokenStartColumn: number;
  tokenEndColumn: number;
  renderedColor: string | null;
  renderedFontStyle: string | null;
  renderedFontWeight: string | null;
  renderedClassName: string | null;
  activeThemeId: string | null;
  activeThemeSyntaxCount: number;
  semanticDecorationCount: number;
  captures: TokenInspectorCapture[];
  linePreview: string;
}

interface RuntimeLineTokens {
  findTokenIndexAtOffset(offset: number): number;
  getClassName(tokenIndex: number): string;
  getEndOffset(tokenIndex: number): number;
  getLanguageId(tokenIndex: number): string;
  getStandardTokenType(tokenIndex: number): number;
  getStartOffset(tokenIndex: number): number;
}

interface RuntimeTokenizedModel extends monaco.editor.ITextModel {
  tokenization?: {
    forceTokenization?: (lineNumber: number) => void;
    getLineTokens?: (lineNumber: number) => RuntimeLineTokens;
  };
}

function getTokenAtColumn(
  tokens: monaco.Token[],
  lineLength: number,
  column: number,
) {
  const zeroColumn = Math.max(0, column - 1);
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const nextToken = tokens[index + 1];
    const endOffset = nextToken?.offset ?? lineLength;
    if (zeroColumn >= token.offset && zeroColumn < endOffset) {
      return { token, endOffset };
    }
  }

  const fallback = tokens[tokens.length - 1];
  return fallback ? { token: fallback, endOffset: lineLength } : null;
}

function getContextualModelToken(
  model: monaco.editor.ITextModel,
  lineNumber: number,
  column: number,
) {
  const tokenizedModel = model as RuntimeTokenizedModel;
  const tokenization = tokenizedModel.tokenization;
  if (!tokenization?.getLineTokens) return null;

  tokenization.forceTokenization?.(lineNumber);
  const lineTokens = tokenization.getLineTokens(lineNumber);
  const tokenIndex = lineTokens.findTokenIndexAtOffset(Math.max(0, column - 1));

  return {
    className: lineTokens.getClassName(tokenIndex),
    endColumn: lineTokens.getEndOffset(tokenIndex) + 1,
    languageId: lineTokens.getLanguageId(tokenIndex),
    standardTokenType: lineTokens.getStandardTokenType(tokenIndex),
    startColumn: lineTokens.getStartOffset(tokenIndex) + 1,
  };
}

function standardTokenTypeLabel(type: number) {
  if (type === 1) return "comment";
  if (type === 2) return "string";
  if (type === 3) return "regexp";
  return "other";
}

function getRenderedTokenStyle(
  editor: monaco.editor.IStandaloneCodeEditor,
  position: monaco.Position,
) {
  const visiblePosition = editor.getScrolledVisiblePosition(position);
  const editorNode = editor.getDomNode();
  if (!visiblePosition || !editorNode) return null;

  const editorRect = editorNode.getBoundingClientRect();
  const element = document.elementFromPoint(
    editorRect.left + visiblePosition.left + 2,
    editorRect.top + visiblePosition.top + visiblePosition.height / 2,
  );
  if (!(element instanceof HTMLElement)) return null;

  const style = window.getComputedStyle(element);
  const semanticElement = element.closest("[class*='axon-sem-']");
  return {
    color: style.color || null,
    fontStyle: style.fontStyle || null,
    fontWeight: style.fontWeight || null,
    className:
      element.className ||
      (semanticElement instanceof HTMLElement ? semanticElement.className : null),
  };
}

function toCaptureDetails(
  matches: AxonTokenCaptureMatch[],
  tokens: ThemeTokenMap,
  syntax: Record<string, ExtensionThemeSyntaxStyle>,
): TokenInspectorCapture[] {
  const defaultEntries = [
    ...createDefaultCaptureEntries(tokens),
    ...createExtensionSyntaxThemeEntries(syntax),
  ];
  return matches.map((match) => {
    const style = resolveCaptureStyleForInspector(match.capture, defaultEntries);
    return {
      capture: match.capture,
      matchedToken: match.token,
      match: match.match,
      expectedColor: style?.color ?? null,
      fontStyle: style?.fontStyle ?? null,
    };
  });
}

export function inspectEditorToken(
  editor: monaco.editor.IStandaloneCodeEditor,
  filePath: string,
  themeTokens: ThemeTokenMap,
  themeSyntax: Record<string, ExtensionThemeSyntaxStyle> = {},
): TokenInspectorReport | null {
  const model = editor.getModel();
  const position = editor.getPosition();
  if (!model || model.isDisposed() || !position) return null;

  const languageId = model.getLanguageId();
  const lineContent = model.getLineContent(position.lineNumber);
  const contextualToken = getContextualModelToken(
    model,
    position.lineNumber,
    position.column,
  );
  const tokensByLine = monaco.editor.tokenize(lineContent, languageId);
  const tokens = tokensByLine[0] ?? [];
  const inferredToken = getTokenAtColumn(
    tokens,
    lineContent.length,
    position.column,
  );
  if (!inferredToken && !contextualToken) return null;

  const tokenStartColumn =
    contextualToken?.startColumn ?? (inferredToken?.token.offset ?? 0) + 1;
  const tokenEndColumn =
    contextualToken?.endColumn ?? (inferredToken?.endOffset ?? lineContent.length) + 1;
  const inspectedPosition = new monaco.Position(
    position.lineNumber,
    tokenStartColumn,
  );
  const word = model.getWordAtPosition(position)?.word ?? "";
  const renderedStyle = getRenderedTokenStyle(editor, inspectedPosition);
  const editorNode = editor.getDomNode();
  const activeThemeSyntaxCount = Number(
    editorNode?.dataset.axonThemeSyntaxCount ?? "0",
  );
  const semanticDecorationCount = Number(
    editorNode?.dataset.axonSemanticDecorationCount ?? "0",
  );
  const captures = toCaptureDetails(
    findCapturesForMonacoToken(inferredToken?.token.type ?? ""),
    themeTokens,
    themeSyntax,
  );

  // This report is intentionally derived from the mounted Monaco model and the
  // rendered DOM in one pass. The tokenizer tells us what Axon thinks the token
  // should be; the DOM color tells us what the user is actually seeing after
  // semantic tokens, decorations, and theme rules have all been applied.
  return {
    filePath,
    languageId,
    line: position.lineNumber,
    column: position.column,
    tokenText: lineContent.slice(tokenStartColumn - 1, tokenEndColumn - 1),
    word,
    modelTokenClassName: contextualToken?.className ?? "not available",
    modelTokenLanguage: contextualToken?.languageId ?? languageId,
    modelTokenType: contextualToken
      ? standardTokenTypeLabel(contextualToken.standardTokenType)
      : "not available",
    inferredMonacoToken: inferredToken?.token.type || "plain",
    inferredTokenLanguage: inferredToken?.token.language ?? languageId,
    inferenceSource: contextualToken ? "model" : "standalone-line",
    tokenStartColumn,
    tokenEndColumn,
    renderedColor: renderedStyle?.color ?? null,
    renderedFontStyle: renderedStyle?.fontStyle ?? null,
    renderedFontWeight: renderedStyle?.fontWeight ?? null,
    renderedClassName: renderedStyle?.className ?? null,
    activeThemeId: editorNode?.dataset.axonThemeId ?? null,
    activeThemeSyntaxCount: Number.isFinite(activeThemeSyntaxCount)
      ? activeThemeSyntaxCount
      : 0,
    semanticDecorationCount: Number.isFinite(semanticDecorationCount)
      ? semanticDecorationCount
      : 0,
    captures,
    linePreview: lineContent,
  };
}
