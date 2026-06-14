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

    try {
      targetWindow.webContents.send(channel, payload);
    } catch {
      // Electron can destroy the native WebContents between the guard above and
      // the actual send call during quit/reload/update. Treat that race as a
      // no-op because these events are only renderer notifications; crashing the
      // main process on shutdown is worse than dropping a late file/LSP event.
    }
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
