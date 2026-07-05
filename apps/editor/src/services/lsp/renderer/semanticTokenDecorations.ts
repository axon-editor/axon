import * as monaco from "monaco-editor";
import {
  LANGUAGE_SERVER_SEMANTIC_TOKEN_MODIFIERS,
  LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES,
} from "../../../shared/lsp";
import {
  createSemanticTokenColors,
  type ThemeTokenMap,
} from "../../../renderer/shared/themes/types";
import { type ExtensionThemeSyntaxStyle } from "../../../shared/extensions";
import { getSemanticTokensForModel } from "./lspSemanticTokens";

const SEMANTIC_STYLE_ELEMENT_ID = "axon-semantic-token-decoration-styles";
const semanticTokenTypeNames = [...LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES];
const semanticTokenModifierNames = [...LANGUAGE_SERVER_SEMANTIC_TOKEN_MODIFIERS];

type SemanticSelectorMap = Record<string, string>;

function semanticClassName(selector: string) {
  return `axon-sem-${selector.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

function resolveSemanticSelector(
  tokenType: string,
  modifiers: string[],
  colors: SemanticSelectorMap,
) {
  const exactSelector = [tokenType, ...modifiers].join(".");
  if (colors[exactSelector]) return exactSelector;

  for (const modifier of modifiers) {
    const modifierSelector = `${tokenType}.${modifier}`;
    if (colors[modifierSelector]) return modifierSelector;
  }

  return colors[tokenType] ? tokenType : null;
}

function tokenModifiersFromBits(bits: number) {
  const modifiers: string[] = [];
  for (let index = 0; index < semanticTokenModifierNames.length; index += 1) {
    if ((bits & (1 << index)) === 0) continue;
    modifiers.push(semanticTokenModifierNames[index]);
  }
  return modifiers;
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
  const colors: SemanticSelectorMap = createSemanticTokenColors(tokens, syntax);
  let styleElement = document.getElementById(SEMANTIC_STYLE_ELEMENT_ID);
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = SEMANTIC_STYLE_ELEMENT_ID;
    document.head.appendChild(styleElement);
  }

  // Monaco's standalone semantic-token theme matcher is the weak link here.
  // Axon still uses Monaco for the editor surface, but the final semantic paint
  // is CSS we own: each semantic selector becomes a real inline decoration
  // class. That bypasses Monaco's type/modifier matching bug while keeping
  // theme colors generated from the same createSemanticTokenColors() contract.
  styleElement.textContent = Object.entries(colors)
    .map(([selector, color]) => {
      const className = semanticClassName(selector);
      return [
        `.monaco-editor .${className}`,
        `.monaco-editor .${className} span`,
        `.monaco-editor span.${className}`,
      ].join(",") + `{color:${color} !important;}`;
    })
    .join("\n");
}

export async function createSemanticTokenDecorations(
  model: monaco.editor.ITextModel,
  tokens: ThemeTokenMap,
  syntax: Record<string, ExtensionThemeSyntaxStyle> = {},
) {
  const semanticTokens = await getSemanticTokensForModel(model);
  if (!semanticTokens || semanticTokens.data.length === 0) return [];

  const colors: SemanticSelectorMap = createSemanticTokenColors(tokens, syntax);
  const decorations: monaco.editor.IModelDeltaDecoration[] = [];
  let lineNumber = 1;
  let column = 1;

  for (let offset = 0; offset < semanticTokens.data.length; offset += 5) {
    const deltaLine = semanticTokens.data[offset] ?? 0;
    const deltaColumn = semanticTokens.data[offset + 1] ?? 0;
    lineNumber += deltaLine;
    column = deltaLine === 0 ? column + deltaColumn : deltaColumn + 1;

    const length = semanticTokens.data[offset + 2] ?? 0;
    const tokenType = semanticTokenTypeNames[semanticTokens.data[offset + 3] ?? -1];
    if (!tokenType || length <= 0) continue;

    const modifiers = tokenModifiersFromBits(semanticTokens.data[offset + 4] ?? 0);
    const selector = resolveSemanticSelector(tokenType, modifiers, colors);
    if (!selector) continue;

    const end = resolveTokenEndPosition(model, lineNumber, column, length);
    decorations.push({
      range: new monaco.Range(lineNumber, column, end.lineNumber, end.column),
      options: {
        inlineClassName: semanticClassName(selector),
      },
    });
  }

  return decorations;
}
