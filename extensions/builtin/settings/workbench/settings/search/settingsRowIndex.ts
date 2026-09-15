/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Row-level settings search used by the dropdown under the search box. Each
// entry maps back to a single control on a settings page, so picking a result
// can navigate to that exact row instead of just the top of its section. The
// breadcrumb path in the popup reads section > subgroup > row (for example
// "Editor > Editor behavior > Auto Save") which mirrors how users describe
// where a switch lives when they ask someone "where is that setting again?".
//
// rowKey is the DOM anchor both here and the matching `data-settings-row`
// attribute rendered by the sections, which is how navigation can scroll the
// row into view and flash it.
import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "../lib/settingsData";
import { tokenizeQuery } from "./tokenize";

export interface SettingsRowItem {
  rowKey: string;
  sectionId: SettingsSectionId;
  // Optional second breadcrumb level (the compact sub-heading on the Editor
  // page). Undefined elsewhere so the path stays two levels deep.
  subgroup?: string;
  label: string;
  // Extra words that are natural to type but never appear in the label, such
  // as "venv", "prettier", or "wallpaper".
  keywords: string[];
}

export interface SettingsRowMatch {
  rowKey: string;
  sectionId: SettingsSectionId;
  subgroup?: string;
  label: string;
  matchCount: number;
}

interface SettingsRowEntry extends SettingsRowItem {
  haystack: string;
}

export const SETTINGS_ROW_ITEMS: SettingsRowItem[] = [
  { rowKey: "theme", sectionId: "appearance", label: "Theme", keywords: ["theme file", "dark", "light", "color scheme"] },
  { rowKey: "ui-font", sectionId: "appearance", label: "UI font", keywords: ["interface", "system ui", "zed sans", "axon sans"] },
  { rowKey: "settings-surface", sectionId: "appearance", label: "Open settings in", keywords: ["tab", "window", "separate window", "surface", "preference"] },
  { rowKey: "sidebar-side", sectionId: "appearance", label: "Sidebar side", keywords: ["layout", "left", "right", "file explorer position"] },

  { rowKey: "app-glass", sectionId: "background", label: "App glass", keywords: ["glass mode", "vibrancy", "mica", "acrylic", "transparency", "native material"] },
  { rowKey: "overlay-opacity", sectionId: "background", label: "Overlay opacity", keywords: ["modal", "popup", "backdrop", "translucency"] },
  { rowKey: "surface-blur", sectionId: "background", label: "Surface blur", keywords: ["blur radius", "modal glass", "frosted"] },
  { rowKey: "editor-image", sectionId: "background", label: "Editor image", keywords: ["wallpaper", "choose image", "background picture", "file path"] },
  { rowKey: "image-opacity", sectionId: "background", label: "Image opacity", keywords: ["dim", "fade", "transparency"] },
  { rowKey: "image-blur", sectionId: "background", label: "Image blur", keywords: ["soften", "radius"] },
  { rowKey: "image-fit", sectionId: "background", label: "Image fit", keywords: ["cover", "contain", "fill", "tile", "center"] },

  { rowKey: "import-font", sectionId: "fonts", label: "Import font file", keywords: ["ttf", "otf", "woff", "woff2", "add font", "custom"] },

  { rowKey: "font-preset", sectionId: "editor", label: "Font preset", keywords: ["zed like", "jetbrains", "fira code", "sf mono", "geist", "cascadia", "typography"] },
  { rowKey: "editor-font", sectionId: "editor", label: "Editor font", keywords: ["monospace", "coding font", "family"] },
  { rowKey: "font-size", sectionId: "editor", label: "Font size", keywords: ["zoom", "text size", "scale"] },
  { rowKey: "line-height", sectionId: "editor", label: "Line height", keywords: ["line spacing", "vertical rhythm"] },
  { rowKey: "font-weight", sectionId: "editor", label: "Font weight", keywords: ["bold", "thickness", "medium", "light"] },
  { rowKey: "font-ligatures", sectionId: "editor", label: "Ligatures", keywords: ["font features", "flat", "calt", "fira code ligature"] },
  { rowKey: "quick-suggestions", sectionId: "editor", label: "Quick suggestions", keywords: ["completion", "autocomplete", "auto suggest", "intellisense"] },
  { rowKey: "trigger-character-suggestions", sectionId: "editor", label: "Trigger character suggestions", keywords: ["dot trigger", "period trigger", "completion on"] },
  { rowKey: "suggestion-preview", sectionId: "editor", label: "Suggestion preview text", keywords: ["ghost text", "inline preview", "completion preview"] },
  { rowKey: "word-based-suggestions", sectionId: "editor", label: "Word-based suggestions", keywords: ["document words", "local completion"] },
  { rowKey: "tab-size", sectionId: "editor", label: "Tab size", keywords: ["indent width", "indentation", "columns"] },
  { rowKey: "insert-spaces", sectionId: "editor", label: "Indent with spaces", keywords: ["tabs vs spaces", "indentation", "soft tabs"] },
  { rowKey: "detect-indentation", sectionId: "editor", label: "Detect indentation", keywords: ["auto indent", "infer", "per file"] },
  { rowKey: "code-padding-left", sectionId: "editor", label: "Code left spacing", keywords: ["gutter gap", "padding", "left space"] },
  { rowKey: "indentation-guides", sectionId: "editor", label: "Indentation guides", keywords: ["vertical lines", "nesting lines"] },
  { rowKey: "active-indentation-guide", sectionId: "editor", label: "Active indentation guide", keywords: ["current guide", "highlight"] },
  { rowKey: "bracket-pair-guides", sectionId: "editor", label: "Bracket pair guides", keywords: ["braces guides", "matching brackets", "nesting"] },
  { rowKey: "cursor-style", sectionId: "editor", label: "Cursor style", keywords: ["block", "underline", "caret", "insertion point"] },
  { rowKey: "cursor-blinking", sectionId: "editor", label: "Cursor blinking", keywords: ["blink animation", "smooth blink", "caret"] },

  { rowKey: "auto-save", sectionId: "editor", subgroup: "Editor behavior", label: "Auto Save", keywords: ["autosave", "save automatically", "file write"] },
  { rowKey: "format-on-save", sectionId: "editor", subgroup: "Editor behavior", label: "Format on save", keywords: ["prettier", "formatter", "auto format"] },
  { rowKey: "snippets", sectionId: "editor", subgroup: "Editor behavior", label: "Snippets", keywords: ["completion snippet", "code templates"] },
  { rowKey: "emmet", sectionId: "editor", subgroup: "Editor behavior", label: "Emmet", keywords: ["abbreviation", "html expansion", "jsx"] },
  { rowKey: "multi-cursor-modifier", sectionId: "editor", subgroup: "Editor behavior", label: "Multi-cursor modifier", keywords: ["multiple cursors", "alt click", "ctrl click", "cmd"] },
  { rowKey: "breadcrumbs", sectionId: "editor", subgroup: "Editor behavior", label: "Breadcrumbs", keywords: ["path bar", "symbol path", "navigation"] },
  { rowKey: "hover-placement", sectionId: "editor", subgroup: "Editor behavior", label: "Hover placement", keywords: ["hover position", "above", "below", "tooltip"] },
  { rowKey: "sticky-scroll", sectionId: "editor", subgroup: "Editor behavior", label: "Sticky scroll", keywords: ["sticky rows", "scope header", "scroll pin"] },
  { rowKey: "line-trace", sectionId: "editor", subgroup: "Editor behavior", label: "Line Trace", keywords: ["blame", "git author", "committed line", "commit summary"] },
  { rowKey: "remember-expanded-folders", sectionId: "editor", subgroup: "Editor behavior", label: "Remember expanded folders", keywords: ["file explorer", "expanded state", "folder tree"] },
  { rowKey: "code-folding", sectionId: "editor", subgroup: "Editor behavior", label: "Code folding", keywords: ["collapse", "fold controls", "regions"] },
  { rowKey: "minimap", sectionId: "editor", subgroup: "Editor behavior", label: "Minimap", keywords: ["code overview", "scrollbar map", "preview map"] },
  { rowKey: "scrollbar-markers", sectionId: "editor", subgroup: "Editor behavior", label: "Scrollbar markers", keywords: ["overview ruler", "diagnostic marks", "search matches"] },

  { rowKey: "gpu-acceleration", sectionId: "terminal", label: "GPU acceleration", keywords: ["webgl", "xterm renderer", "dom renderer", "performance"] },

  { rowKey: "lsp-enabled", sectionId: "languageServers", label: "Language services", keywords: ["lsp", "diagnostics", "intellisense", "language server"] },
  { rowKey: "python-environment", sectionId: "languageServers", label: "Python environment", keywords: ["venv", "virtualenv", "poetry", "pipenv", "uv", "pyenv", "conda", "pyright"] },
  { rowKey: "language-tools", sectionId: "languageServers", label: "Language Tools", keywords: ["manage servers", "install lsp", "status"] },
  { rowKey: "lsp-logs", sectionId: "languageServers", label: "LSP Logs", keywords: ["debug logs", "server output", "troubleshoot"] },

  { rowKey: "assistant", sectionId: "ai", label: "Assistant", keywords: ["axon agent", "enable agent", "chat panel"] },
  { rowKey: "provider", sectionId: "ai", label: "Provider", keywords: ["runtime", "local models", "ollama", "llama"] },
  { rowKey: "model", sectionId: "ai", label: "Model", keywords: ["catalog", "download", "installed", "gemma", "mistral"] },
  { rowKey: "inline-completions", sectionId: "ai", label: "Inline completions", keywords: ["ghost text", "ai autocomplete", "copilot style"] },
  { rowKey: "workspace-context", sectionId: "ai", label: "Workspace context", keywords: ["active files", "git changes", "diagnostics", "project context"] },
];

const ROW_INDEX: SettingsRowEntry[] = SETTINGS_ROW_ITEMS.map((item) => {
  const sectionLabel =
    SETTINGS_SECTIONS.find((section) => section.id === item.sectionId)?.label ??
    "";
  const haystack = ` ${[sectionLabel, item.subgroup, item.label, ...item.keywords]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")} `;
  return { ...item, haystack };
});

export function matchSettingsRows(query: string): SettingsRowMatch[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];

  const matches: SettingsRowMatch[] = [];
  for (const entry of ROW_INDEX) {
    const matchedTokens = tokens.filter((token) =>
      entry.haystack.includes(token),
    );
    if (matchedTokens.length === tokens.length) {
      matches.push({
        rowKey: entry.rowKey,
        sectionId: entry.sectionId,
        subgroup: entry.subgroup,
        label: entry.label,
        matchCount: matchedTokens.length,
      });
    }
  }

  // Rows that hit on more query words are more relevant, so the best look
  // like "Auto Save" for "auto save" rather than secondary one-word hits.
  matches.sort((a, b) => b.matchCount - a.matchCount);
  return matches;
}