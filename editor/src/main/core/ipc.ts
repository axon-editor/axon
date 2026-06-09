import { BrowserWindow } from "electron";
import type { AxonCommand } from "../../shared/commands";

export interface MainProcessIpcDependencies {
  getMainWindow: () => BrowserWindow | null;
}

export function createMainProcessIpc(
  deps: MainProcessIpcDependencies,
) {
  function sendToRenderer(
    channel: string,
    payload?: unknown,
    targetWindow = deps.getMainWindow(),
  ) {
    // Chokidar and child-process callbacks can fire after the user closes or
    // reloads the Electron window. A BrowserWindow reference can still be
    // non-null while its native object is already destroyed, so every delayed IPC
    // send must pass through this guard instead of calling webContents directly.
    if (!targetWindow || targetWindow.isDestroyed()) return;
    if (targetWindow.webContents.isDestroyed()) return;
    targetWindow.webContents.send(channel, payload);
  }

  function sendMenuCommand(command: AxonCommand) {
    const targetWindow = BrowserWindow.getFocusedWindow() ?? deps.getMainWindow();
    sendToRenderer("menu:command", command, targetWindow);
  }

  return {
    sendToRenderer,
    sendMenuCommand,
  };
}
