// Monaco editor theme built from the Sora color scheme by aejkatappaja.
// Original theme: https://github.com/Aejkatappaja/sora-theme
// Colors mapped from Zed theme syntax tokens to Monaco token rules.
import * as monaco from "monaco-editor";
import { type BuiltInThemeId } from "../../shared/settings";

export const AXON_MONACO_THEME: BuiltInThemeId = "axon-dark";

type MonacoInstance = typeof monaco;

const registeredMonacos = new WeakSet<MonacoInstance>();

export function getMonacoThemeId(themeId: BuiltInThemeId) {
  return themeId;
}

function defineCompanionThemes(monacoInstance: MonacoInstance) {
  monacoInstance.editor.defineTheme("sora", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "586478", fontStyle: "italic" },
      { token: "keyword", foreground: "b0a0d8", fontStyle: "italic" },
      { token: "string", foreground: "90c8a0" },
      { token: "number", foreground: "d4b878" },
      { token: "type", foreground: "d0a888" },
      { token: "function", foreground: "80c8e0" },
      { token: "variable", foreground: "b4bcd0" },
      { token: "", foreground: "c8d0e0" },
    ],
    colors: {
      "editor.background": "#0e1018",
      "editor.foreground": "#c8d0e0",
      "editor.lineHighlightBackground": "#171a24",
      "editor.selectionBackground": "#1e243080",
      "editorLineNumber.foreground": "#364050",
      "editorLineNumber.activeForeground": "#80c8e0",
      "editorCursor.foreground": "#80c8e0",
      "editorGutter.background": "#0e1018",
      "editorIndentGuide.background1": "#222838",
      "editorIndentGuide.activeBackground1": "#364050",
    },
  });

  monacoInstance.editor.defineTheme("catppuccin-mocha", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6c7086", fontStyle: "italic" },
      { token: "keyword", foreground: "cba6f7", fontStyle: "italic" },
      { token: "string", foreground: "a6e3a1" },
      { token: "number", foreground: "fab387" },
      { token: "type", foreground: "f9e2af" },
      { token: "function", foreground: "89b4fa" },
      { token: "variable", foreground: "cdd6f4" },
      { token: "", foreground: "cdd6f4" },
    ],
    colors: {
      "editor.background": "#1e1e2e",
      "editor.foreground": "#cdd6f4",
      "editor.lineHighlightBackground": "#313244",
      "editor.selectionBackground": "#45475a",
      "editorLineNumber.foreground": "#6c7086",
      "editorLineNumber.activeForeground": "#89b4fa",
      "editorCursor.foreground": "#f5e0dc",
      "editorGutter.background": "#1e1e2e",
      "editorIndentGuide.background1": "#45475a",
      "editorIndentGuide.activeBackground1": "#585b70",
    },
  });

  monacoInstance.editor.defineTheme("tokyo-night", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "565f89", fontStyle: "italic" },
      { token: "keyword", foreground: "bb9af7", fontStyle: "italic" },
      { token: "string", foreground: "9ece6a" },
      { token: "number", foreground: "ff9e64" },
      { token: "type", foreground: "2ac3de" },
      { token: "function", foreground: "7aa2f7" },
      { token: "variable", foreground: "c0caf5" },
      { token: "", foreground: "c0caf5" },
    ],
    colors: {
      "editor.background": "#1a1b26",
      "editor.foreground": "#c0caf5",
      "editor.lineHighlightBackground": "#24283b",
      "editor.selectionBackground": "#33467c",
      "editorLineNumber.foreground": "#3b4261",
      "editorLineNumber.activeForeground": "#7aa2f7",
      "editorCursor.foreground": "#c0caf5",
      "editorGutter.background": "#1a1b26",
      "editorIndentGuide.background1": "#292e42",
      "editorIndentGuide.activeBackground1": "#3b4261",
    },
  });
}

export function registerAxonTheme(
  monacoInstance: MonacoInstance = monaco,
  themeId: BuiltInThemeId = AXON_MONACO_THEME,
) {
  if (registeredMonacos.has(monacoInstance)) {
    monacoInstance.editor.setTheme(getMonacoThemeId(themeId));
    return;
  }

  monacoInstance.editor.defineTheme(AXON_MONACO_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      // comments
      { token: "comment", foreground: "586478", fontStyle: "italic" },
      { token: "comment.doc", foreground: "586478", fontStyle: "italic" },

      // keywords
      { token: "keyword", foreground: "b0a0d8", fontStyle: "italic" },
      { token: "keyword.control", foreground: "b0a0d8", fontStyle: "italic" },
      { token: "keyword.flow", foreground: "b0a0d8", fontStyle: "italic" },
      { token: "keyword.json", foreground: "b0a0d8" },
      { token: "keyword.operator", foreground: "8898b8" },
      { token: "storage", foreground: "b0a0d8", fontStyle: "italic" },
      { token: "storage.type", foreground: "b0a0d8", fontStyle: "italic" },

      // functions
      { token: "entity.name.function", foreground: "80c8e0" },
      { token: "function", foreground: "80c8e0" },
      { token: "function.call", foreground: "80c8e0" },
      { token: "support.function", foreground: "80c8e0", fontStyle: "italic" },
      { token: "meta.function-call", foreground: "80c8e0" },

      // types
      { token: "entity.name.type", foreground: "d0a888" },
      { token: "entity.name.class", foreground: "d0a888" },
      { token: "type", foreground: "d0a888" },
      { token: "type.identifier", foreground: "d0a888" },
      { token: "identifier.type", foreground: "d0a888" },
      { token: "namespace", foreground: "d0a888" },
      { token: "support.type", foreground: "d0a888", fontStyle: "italic" },
      { token: "support.class", foreground: "d0a888" },

      // strings
      { token: "string", foreground: "90c8a0" },
      { token: "string.key.json", foreground: "80c8e0" },
      { token: "string.value.json", foreground: "90c8a0" },
      { token: "string.escape", foreground: "78b8b0", fontStyle: "bold" },
      { token: "string.regexp", foreground: "78b8b0" },
      { token: "regexp", foreground: "78b8b0" },

      // numbers
      { token: "constant.numeric", foreground: "d4b878" },
      { token: "number", foreground: "d4b878" },
      { token: "number.json", foreground: "d4b878" },

      // constants and booleans
      { token: "constant.language", foreground: "d0909c", fontStyle: "italic" },
      { token: "constant", foreground: "d4b878" },
      { token: "constant.json", foreground: "d0909c", fontStyle: "italic" },
      { token: "predefined", foreground: "d0909c", fontStyle: "italic" },
      { token: "variable.language", foreground: "d0909c", fontStyle: "italic" },

      // variables
      { token: "identifier", foreground: "c8d0e0" },
      { token: "variable", foreground: "b4bcd0" },
      { token: "variable.parameter", foreground: "d0a888" },
      { token: "parameter", foreground: "d0a888" },
      { token: "variable.other.member", foreground: "8898b8" },

      // properties
      { token: "variable.other.property", foreground: "8898b8" },
      { token: "support.variable.property", foreground: "8898b8" },
      { token: "property", foreground: "8898b8" },

      // tags (HTML/JSX)
      { token: "entity.name.tag", foreground: "78b8b0" },
      { token: "entity.other.attribute-name", foreground: "d0a888" },
      { token: "tag", foreground: "78b8b0" },
      { token: "tag.id", foreground: "78b8b0" },
      { token: "tag.class", foreground: "78b8b0" },
      { token: "attribute.name", foreground: "d0a888" },
      { token: "attribute.value", foreground: "90c8a0" },
      { token: "metatag", foreground: "9aa4b8" },
      { token: "delimiter.html", foreground: "9aa4b8" },
      { token: "punctuation.definition.tag", foreground: "9aa4b8" },

      // operators and punctuation
      { token: "keyword.operator", foreground: "8898b8" },
      { token: "operator", foreground: "8898b8" },
      { token: "punctuation", foreground: "9aa4b8" },
      { token: "delimiter", foreground: "9aa4b8" },
      { token: "delimiter.bracket", foreground: "9aa4b8" },
      { token: "delimiter.parenthesis", foreground: "9aa4b8" },
      { token: "delimiter.square", foreground: "9aa4b8" },
      { token: "delimiter.curly", foreground: "9aa4b8" },

      // constructors and enums
      {
        token: "entity.name.function.constructor",
        foreground: "d0a888",
        fontStyle: "bold",
      },
      { token: "variable.other.enummember", foreground: "d0a888" },

      // attributes (decorators)
      {
        token: "entity.other.attribute",
        foreground: "d0a888",
        fontStyle: "italic",
      },
      { token: "annotation", foreground: "d0a888", fontStyle: "italic" },

      // embedded (template literals etc)
      { token: "meta.embedded", foreground: "78b8b0" },

      // markup (markdown)
      { token: "markup.heading", foreground: "80c8e0", fontStyle: "bold" },
      { token: "markup.bold", foreground: "dce4f0", fontStyle: "bold" },
      { token: "markup.italic", foreground: "dce4f0", fontStyle: "italic" },
      { token: "markup.inline.raw", foreground: "90c8a0" },
      { token: "markup.fenced_code", foreground: "90c8a0" },
      { token: "markup.list", foreground: "8898b8" },
      { token: "meta.link", foreground: "80c8e0" },

      // Go specific
      { token: "keyword.type.go", foreground: "d0a888" },
      {
        token: "keyword.package.go",
        foreground: "b0a0d8",
        fontStyle: "italic",
      },
      { token: "keyword.import.go", foreground: "b0a0d8", fontStyle: "italic" },
      {
        token: "keyword.function.go",
        foreground: "b0a0d8",
        fontStyle: "italic",
      },
      { token: "keyword.var.go", foreground: "b0a0d8", fontStyle: "italic" },
      { token: "keyword.const.go", foreground: "b0a0d8", fontStyle: "italic" },

      // default text
      { token: "", foreground: "c8d0e0" },
    ],
    colors: {
      // editor
      "editor.background": "#0e1018",
      "editor.foreground": "#c8d0e0",
      "editor.lineHighlightBackground": "#171a24",
      "editor.selectionBackground": "#1e243080",
      "editor.inactiveSelectionBackground": "#1e243040",
      "editor.findMatchBackground": "#1a3050",
      "editor.findMatchHighlightBackground": "#1a305080",

      // line numbers
      "editorLineNumber.foreground": "#364050",
      "editorLineNumber.activeForeground": "#80c8e0",

      // cursor
      "editorCursor.foreground": "#80c8e0",

      // gutter
      "editorGutter.background": "#0e1018",

      // indent guides
      "editorIndentGuide.background1": "#222838",
      "editorIndentGuide.activeBackground1": "#364050",

      // brackets
      "editorBracketMatch.background": "#1e243080",
      "editorBracketMatch.border": "#80c8e0",

      // scrollbar
      "scrollbarSlider.background": "#36405040",
      "scrollbarSlider.hoverBackground": "#36405080",
      "scrollbarSlider.activeBackground": "#364050",

      // tabs
      "tab.activeBackground": "#0e1018",
      "tab.inactiveBackground": "#0a0c12",
      "tab.activeForeground": "#c8d0e0",
      "tab.inactiveForeground": "#586478",
      "tab.border": "#222838",
      "tab.activeBorderTop": "#80c8e0",

      // sidebar
      "sideBar.background": "#0a0c12",
      "sideBar.foreground": "#9aa4b8",
      "sideBar.border": "#222838",
      "sideBarTitle.foreground": "#586478",

      // status bar
      "statusBar.background": "#0a0c12",
      "statusBar.foreground": "#9aa4b8",

      // title bar
      "titleBar.activeBackground": "#0a0c12",
      "titleBar.activeForeground": "#c8d0e0",

      // input
      "input.background": "#14161e",
      "input.foreground": "#c8d0e0",
      "input.border": "#222838",
      "input.placeholderForeground": "#586478",
      focusBorder: "#80c8e0",

      // list
      "list.activeSelectionBackground": "#1e2430",
      "list.activeSelectionForeground": "#c8d0e0",
      "list.hoverBackground": "#1e2430",
      "list.focusBackground": "#1e2430",

      // panel
      "panel.background": "#0a0c12",
      "panel.border": "#222838",

      // terminal
      "terminal.background": "#0e1018",
      "terminal.foreground": "#c8d0e0",
      "terminal.ansiCyan": "#80c8e0",
      "terminal.ansiGreen": "#90c8a0",
      "terminal.ansiRed": "#d0909c",
      "terminal.ansiYellow": "#d4b878",
      "terminal.ansiBlue": "#b0a0d8",
      "terminal.ansiMagenta": "#d0a888",

      // widgets
      "editorWidget.background": "#14161e",
      "editorWidget.border": "#222838",
      "editorSuggestWidget.background": "#14161e",
      "editorSuggestWidget.border": "#222838",
      "editorSuggestWidget.selectedBackground": "#1e2430",
      "editorSuggestWidget.highlightForeground": "#80c8e0",
    },
  });

  defineCompanionThemes(monacoInstance);
  registeredMonacos.add(monacoInstance);
  monacoInstance.editor.setTheme(getMonacoThemeId(themeId));
}

export const registerSoraTheme = registerAxonTheme;
