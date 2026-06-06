export const AXON_COMMANDS = {
  ABOUT: "about",
  NEW_FILE: "new-file",
  OPEN_FOLDER: "open-folder",
  SAVE: "save",
  CLOSE_TAB: "close-tab",
  OPEN_COMMAND_PALETTE: "open-command-palette",
  OPEN_WORKSPACE_SEARCH: "open-workspace-search",
  OPEN_PROBLEMS_PANEL: "open-problems-panel",
  OPEN_OUTPUT_PANEL: "open-output-panel",
  REFRESH_DIAGNOSTICS: "refresh-diagnostics",
  CLEAR_OUTPUT: "clear-output",
  OPEN_DIFF_VIEW: "open-diff-view",
  OPEN_SOURCE_CONTROL: "open-source-control",
  OPEN_TASK_RUNNER: "open-task-runner",
  OPEN_FILE_OUTLINE: "open-file-outline",
  GO_TO_DEFINITION: "go-to-definition",
  FIND_REFERENCES: "find-references",
  RENAME_SYMBOL: "rename-symbol",
  FORMAT_DOCUMENT: "format-document",
  OPEN_HTML_PREVIEW: "open-html-preview",
  TOGGLE_TERMINAL: "toggle-terminal",
  OPEN_SETTINGS: "open-settings",
  OPEN_EXTENSIONS: "open-extensions",
  OPEN_SETTINGS_JSON: "open-settings-json",
  OPEN_UPDATE_NOTES: "open-update-notes",
  TOGGLE_ZEN_MODE: "toggle-zen-mode",
  NEW_TERMINAL: "new-terminal",
} as const;

export type BuiltInAxonCommand =
  (typeof AXON_COMMANDS)[keyof typeof AXON_COMMANDS];
export type ExtensionAxonCommand = `extension:${string}`;
export type AxonCommand = BuiltInAxonCommand | ExtensionAxonCommand;
