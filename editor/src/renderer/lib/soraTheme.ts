// Monaco editor theme built from the Sora color scheme by aejkatappaja.
// Original theme: https://github.com/Aejkatappaja/sora-theme
// Colors mapped from Zed theme syntax tokens to Monaco token rules.
import * as monaco from "monaco-editor";

export const AXON_MONACO_THEME = "axon";

type MonacoInstance = typeof monaco;

const registeredMonacos = new WeakSet<MonacoInstance>();

export function registerAxonTheme(monacoInstance: MonacoInstance = monaco) {
  if (registeredMonacos.has(monacoInstance)) {
    monacoInstance.editor.setTheme(AXON_MONACO_THEME);
    return;
  }

  monacoInstance.editor.defineTheme(AXON_MONACO_THEME, {
    base: "vs-dark",
    inherit: false,
    rules: [
      // comments
      { token: "comment", foreground: "586478", fontStyle: "italic" },
      { token: "comment.doc", foreground: "586478", fontStyle: "italic" },

      // keywords
      { token: "keyword", foreground: "b0a0d8", fontStyle: "italic" },
      { token: "keyword.control", foreground: "b0a0d8", fontStyle: "italic" },
      { token: "keyword.operator", foreground: "8898b8" },
      { token: "storage", foreground: "b0a0d8", fontStyle: "italic" },
      { token: "storage.type", foreground: "b0a0d8", fontStyle: "italic" },

      // functions
      { token: "entity.name.function", foreground: "80c8e0" },
      { token: "support.function", foreground: "80c8e0", fontStyle: "italic" },
      { token: "meta.function-call", foreground: "80c8e0" },

      // types
      { token: "entity.name.type", foreground: "d0a888" },
      { token: "entity.name.class", foreground: "d0a888" },
      { token: "support.type", foreground: "d0a888", fontStyle: "italic" },
      { token: "support.class", foreground: "d0a888" },

      // strings
      { token: "string", foreground: "90c8a0" },
      { token: "string.escape", foreground: "78b8b0", fontStyle: "bold" },
      { token: "string.regexp", foreground: "78b8b0" },

      // numbers
      { token: "constant.numeric", foreground: "d4b878" },
      { token: "number", foreground: "d4b878" },

      // constants and booleans
      { token: "constant.language", foreground: "d0909c", fontStyle: "italic" },
      { token: "constant", foreground: "d4b878" },
      { token: "variable.language", foreground: "d0909c", fontStyle: "italic" },

      // variables
      { token: "variable", foreground: "b4bcd0" },
      { token: "variable.parameter", foreground: "d0a888" },
      { token: "variable.other.member", foreground: "8898b8" },

      // properties
      { token: "variable.other.property", foreground: "8898b8" },
      { token: "support.variable.property", foreground: "8898b8" },

      // tags (HTML/JSX)
      { token: "entity.name.tag", foreground: "78b8b0" },
      { token: "entity.other.attribute-name", foreground: "d0a888" },
      { token: "punctuation.definition.tag", foreground: "9aa4b8" },

      // operators and punctuation
      { token: "keyword.operator", foreground: "8898b8" },
      { token: "punctuation", foreground: "9aa4b8" },
      { token: "delimiter", foreground: "9aa4b8" },
      { token: "delimiter.bracket", foreground: "9aa4b8" },

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

  registeredMonacos.add(monacoInstance);
  monacoInstance.editor.setTheme(AXON_MONACO_THEME);
}

export const registerSoraTheme = registerAxonTheme;
