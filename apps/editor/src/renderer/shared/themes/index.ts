/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as monaco from "monaco-editor";
import {
  AXON_MONACO_THEME,
  completeThemeTokens,
  type ThemeTokenMap,
} from "./tokenThemes";
import {
  createSyntaxRules,
  type AxonThemeDefinition,
} from "./types";
import {
  appearanceBorderColor,
  resolveThemeGitColors,
  inferThemeAppearance,
} from "./themeAppearance";
import { type ThemeId } from "../../../shared/settings";
import { type ResolvedExtensionTheme } from "../../../shared/extensions";

export {
  AXON_MONACO_THEME,
  resolveActiveTheme,
  resolveThemeTokens,
  getThemeLabel,
  type ThemeTokenMap,
} from "./tokenThemes";

type MonacoInstance = typeof monaco;

const registeredMonacos = new WeakSet<MonacoInstance>();

function buildMonacoTheme(
  theme: AxonThemeDefinition,
  tokens: ThemeTokenMap = theme.tokens,
  extensionTheme?: ResolvedExtensionTheme,
) {
  const appearance = extensionTheme?.appearance ?? inferThemeAppearance(tokens);
  const gitColors = resolveThemeGitColors(appearance);
  const uiBorder = appearanceBorderColor(tokens["panel.border"], appearance);
  const themeData: monaco.editor.IStandaloneThemeData = {
    base: theme.base,
    inherit: true,
    rules: [
      ...createSyntaxRules(tokens, extensionTheme?.syntax),
      ...(theme.tokenRules ?? []),
    ],
    colors: {
      foreground: tokens["editor.foreground"],
      "editor.background": tokens["editor.background"],
      "editor.foreground": tokens["editor.foreground"],
      "editorGutter.background": tokens["editor.gutter.background"],
      "editorBracketHighlight.foreground1": tokens["syntax.bracket"],
      "editorBracketHighlight.foreground2": tokens["syntax.bracket"],
      "editorBracketHighlight.foreground3": tokens["syntax.bracket"],
      "editorBracketHighlight.foreground4": tokens["syntax.bracket"],
      "editorBracketHighlight.foreground5": tokens["syntax.bracket"],
      "editorBracketHighlight.foreground6": tokens["syntax.bracket"],
      "editorBracketHighlight.unexpectedBracket.foreground":
        tokens["syntax.constant"],
      "editorIndentGuide.background1": tokens["panel.border"],
      "editorIndentGuide.activeBackground1": tokens["syntax.function"],
      "input.foreground": tokens["editor.foreground"],
      "textLink.foreground": tokens["syntax.property"],
      "textPreformat.foreground": tokens["editor.foreground"],
      "editorWidget.background": tokens["panel.background"],
      "editorWidget.foreground": tokens["editor.foreground"],
      "editorWidget.border": uiBorder,
      "editorHoverWidget.background": tokens["panel.background"],
      "editorHoverWidget.foreground": tokens["editor.foreground"],
      "editorHoverWidget.border": uiBorder,
      "editorHoverWidget.statusBarBackground": tokens["panel.overlay_hover"],
      "editorSuggestWidget.background": tokens["panel.background"],
      "editorSuggestWidget.foreground": tokens["editor.foreground"],
      "editorSuggestWidget.border": uiBorder,
      "editorSuggestWidget.selectedBackground": tokens["panel.overlay_hover"],
      "editorSuggestWidget.highlightForeground": tokens["syntax.function"],
      "editorSuggestWidget.focusHighlightForeground": tokens["syntax.function"],
      "diffEditor.diagonalFill": tokens["panel.border"],
      "terminal.background": tokens["terminal.background"],
      "terminal.foreground": tokens["terminal.foreground"],
      ...theme.monacoColors,
      ...(extensionTheme?.monaco ?? {}),
      // Git paint is semantic application state, not theme syntax. Keep these
      // assignments after contributed Monaco colors so a theme can style the
      // editor without turning additions red, deletions green, or modifications
      // into an unrelated syntax accent. Alpha changes visual weight only; the
      // underlying green/gold/red/cyan meanings remain stable everywhere.
      "diffEditor.insertedTextBackground": `${gitColors.added}30`,
      "diffEditor.removedTextBackground": `${gitColors.deleted}30`,
      "diffEditor.insertedLineBackground": `${gitColors.added}18`,
      "diffEditor.removedLineBackground": `${gitColors.deleted}18`,
      "editorGutter.addedBackground": `${gitColors.added}b3`,
      "editorGutter.modifiedBackground": `${gitColors.modified}b3`,
      "editorGutter.deletedBackground": `${gitColors.deleted}b3`,
      "editorOverviewRuler.addedForeground": `${gitColors.added}cc`,
      "editorOverviewRuler.modifiedForeground": `${gitColors.modified}cc`,
      "editorOverviewRuler.deletedForeground": `${gitColors.deleted}cc`,
      "minimapGutter.addedBackground": `${gitColors.added}b3`,
      "minimapGutter.modifiedBackground": `${gitColors.modified}b3`,
      "minimapGutter.deletedBackground": `${gitColors.deleted}b3`,
      "gitDecoration.addedResourceForeground": gitColors.added,
      "gitDecoration.untrackedResourceForeground": gitColors.added,
      "gitDecoration.modifiedResourceForeground": gitColors.modified,
      "gitDecoration.deletedResourceForeground": gitColors.deleted,
      "gitDecoration.renamedResourceForeground": gitColors.mixed,
      "gitDecoration.conflictingResourceForeground": gitColors.modified,
    },
  };

  return themeData;
}

function defineAllThemes(
  monacoInstance: MonacoInstance,
  activeThemeId: ThemeId,
  activeTokens?: ThemeTokenMap,
  extensionThemes: ResolvedExtensionTheme[] = [],
  activeSyntax: ResolvedExtensionTheme["syntax"] = {},
) {
  if (extensionThemes.length === 0 && activeTokens) {
    const appearance = inferThemeAppearance(activeTokens);
    const themeDefinition: AxonThemeDefinition = {
      id: activeThemeId,
      label: activeThemeId,
      base: appearance === "light" ? "vs" : "vs-dark",
      tokens: activeTokens,
      monacoColors: {},
      syntax: activeSyntax,
    };
    monacoInstance.editor.defineTheme(
      activeThemeId,
      buildMonacoTheme(themeDefinition, activeTokens, {
        id: activeThemeId,
        label: activeThemeId,
        extensionId: "axon.runtime-theme",
        extensionName: "Axon Runtime Theme",
        appearance,
        tokens: activeTokens,
        syntax: activeSyntax,
        terminal: {},
        monaco: {},
      }),
    );
    return;
  }

  for (const extensionTheme of extensionThemes) {
    const tokens =
      extensionTheme.id === activeThemeId && activeTokens
        ? activeTokens
        : completeThemeTokens(extensionTheme);
    const themeDefinition: AxonThemeDefinition = {
      id: extensionTheme.id,
      label: extensionTheme.label,
      base: extensionTheme.appearance === "light" ? "vs" : "vs-dark",
      tokens,
      monacoColors: extensionTheme.monaco,
    };
    try {
      // Extension themes come from local packages, and the first extension
      // host intentionally accepts Zed-compatible JSON. If a contributed
      // syntax scope or color shape hits a Monaco edge case, Axon should keep
      // running and simply skip that one contributed theme instead of letting
      // Reload Extensions crash the whole renderer.
      monacoInstance.editor.defineTheme(
        extensionTheme.id,
        buildMonacoTheme(themeDefinition, tokens, extensionTheme),
      );
    } catch (err) {
      console.error(
        `failed to register extension theme ${extensionTheme.id}:`,
        err,
      );
    }
  }
}

export function getMonacoThemeId(themeId: ThemeId) {
  return themeId;
}

export function registerAxonTheme(
  monacoInstance: MonacoInstance = monaco,
  themeId: ThemeId = AXON_MONACO_THEME,
  themeTokens?: ThemeTokenMap,
  extensionThemes: ResolvedExtensionTheme[] = [],
  activeSyntax: ResolvedExtensionTheme["syntax"] = {},
) {
  // Every Monaco instance used by @monaco-editor/react must receive the same
  // extension-provided theme definitions. The renderer no longer has a private
  // TypeScript fallback registry, so a missing definition should surface as a
  // real extension-loading problem instead of being hidden by another source.
  defineAllThemes(
    monacoInstance,
    themeId,
    themeTokens,
    extensionThemes,
    activeSyntax,
  );
  registeredMonacos.add(monacoInstance);
  try {
    monacoInstance.editor.setTheme(getMonacoThemeId(themeId));
  } catch (err) {
    console.error(`failed to activate theme ${themeId}:`, err);
  }
}

export function hasRegisteredAxonThemes(
  monacoInstance: MonacoInstance = monaco,
) {
  return registeredMonacos.has(monacoInstance);
}
