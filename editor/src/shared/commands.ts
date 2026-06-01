export const AXON_COMMANDS = {
  ABOUT: "about",
  NEW_FILE: "new-file",
  OPEN_FOLDER: "open-folder",
  SAVE: "save",
  CLOSE_TAB: "close-tab",
  OPEN_COMMAND_PALETTE: "open-command-palette",
  TOGGLE_TERMINAL: "toggle-terminal",
  OPEN_SETTINGS: "open-settings",
  TOGGLE_ZEN_MODE: "toggle-zen-mode",
  NEW_TERMINAL: "new-terminal",
} as const;

export type AxonCommand = (typeof AXON_COMMANDS)[keyof typeof AXON_COMMANDS];
