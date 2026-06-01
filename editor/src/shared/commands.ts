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
  OPEN_DIFF_VIEW: "open-diff-view",
  OPEN_SOURCE_CONTROL: "open-source-control",
  OPEN_TASK_RUNNER: "open-task-runner",
  TOGGLE_TERMINAL: "toggle-terminal",
  OPEN_SETTINGS: "open-settings",
  OPEN_SETTINGS_JSON: "open-settings-json",
  TOGGLE_ZEN_MODE: "toggle-zen-mode",
  NEW_TERMINAL: "new-terminal",
} as const;

export type AxonCommand = (typeof AXON_COMMANDS)[keyof typeof AXON_COMMANDS];
