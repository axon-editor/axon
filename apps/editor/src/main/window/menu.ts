import { BrowserWindow, type MenuItemConstructorOptions } from "electron";
import { AXON_COMMANDS, type AxonCommand } from "../../shared/commands";

function closeFocusedWindow() {
  const targetWindow = BrowserWindow.getFocusedWindow();
  targetWindow?.close();
}

function buildViewMenu(sendMenuCommand: (command: AxonCommand) => void): MenuItemConstructorOptions {
  return {
    label: "View",
    submenu: [
      {
        label: "Command Palette",
        accelerator: "CmdOrCtrl+P",
        click: () => sendMenuCommand(AXON_COMMANDS.OPEN_COMMAND_PALETTE),
      },
      {
        label: "Workspace Search",
        accelerator: "CmdOrCtrl+Shift+F",
        click: () => sendMenuCommand(AXON_COMMANDS.OPEN_WORKSPACE_SEARCH),
      },
      {
        label: "File Outline",
        accelerator: "CmdOrCtrl+Shift+O",
        click: () => sendMenuCommand(AXON_COMMANDS.OPEN_FILE_OUTLINE),
      },
      { type: "separator" },
      {
        label: "Toggle Terminal",
        accelerator: "CmdOrCtrl+J",
        click: () => sendMenuCommand(AXON_COMMANDS.TOGGLE_TERMINAL),
      },
      {
        label: "Toggle Zen Mode",
        accelerator: "CmdOrCtrl+Shift+Z",
        click: () => sendMenuCommand(AXON_COMMANDS.TOGGLE_ZEN_MODE),
      },
    ],
  };
}

export function buildApplicationMenu(
  sendMenuCommand: (command: AxonCommand) => void,
  isMac: boolean,
  createNewWindow: () => void,
) {
  const axonAppMenu: MenuItemConstructorOptions = {
    label: "Axon",
    submenu: [
      {
        label: "About Axon",
        click: () => sendMenuCommand(AXON_COMMANDS.ABOUT),
      },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };

  const helpMenu: MenuItemConstructorOptions = {
    label: "Help",
    submenu: !isMac
      ? [
          {
            label: "About Axon",
            click: () => sendMenuCommand(AXON_COMMANDS.ABOUT),
          } satisfies MenuItemConstructorOptions,
        ]
      : [],
  };

  return [
    ...(isMac ? [axonAppMenu] : []),
    {
      label: "File",
      submenu: [
        {
          label: "New File",
          accelerator: "CmdOrCtrl+N",
          click: () => sendMenuCommand(AXON_COMMANDS.NEW_FILE),
        },
        {
          label: "New Window",
          accelerator: "CmdOrCtrl+Shift+N",
          click: createNewWindow,
        },
        {
          label: "Open Folder...",
          accelerator: "CmdOrCtrl+O",
          click: () => sendMenuCommand(AXON_COMMANDS.OPEN_FOLDER),
        },
        {
          label: "Open Settings JSON",
          accelerator: "CmdOrCtrl+Shift+,",
          click: () => sendMenuCommand(AXON_COMMANDS.OPEN_SETTINGS_JSON),
        },
        {
          label: "Source Control",
          accelerator: "CmdOrCtrl+Shift+G",
          click: () => sendMenuCommand(AXON_COMMANDS.OPEN_SOURCE_CONTROL),
        },
        {
          label: "Open Recent",
          click: () => sendMenuCommand(AXON_COMMANDS.OPEN_RECENT),
        },
        { type: "separator" },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => sendMenuCommand(AXON_COMMANDS.SAVE),
        },
        {
          label: "Save As...",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => sendMenuCommand(AXON_COMMANDS.SAVE_AS),
        },
        { type: "separator" },
        {
          label: "Close Tab",
          accelerator: "CmdOrCtrl+W",
          click: () => sendMenuCommand(AXON_COMMANDS.CLOSE_TAB),
        },
        {
          label: "Close Window",
          accelerator: "CmdOrCtrl+Shift+W",
          click: closeFocusedWindow,
        },
      ],
    },
    { role: "editMenu" },
    buildViewMenu(sendMenuCommand),
    { role: "windowMenu" },
    helpMenu,
  ] satisfies MenuItemConstructorOptions[];
}
