import fs from "fs";
import { ipcMain, shell } from "electron";
import { EXTENSION_IPC_CHANNELS } from "@axon/ipc";
import {
  type ExtensionActionResult,
  type ExtensionCommandExecutionResult,
  type ExtensionMarketplaceState,
  type ExtensionState,
} from "../../shared/extensions";
import { extensionHostService } from "./host/service";
import { getUserExtensionsPath } from "./paths";
import { type WorkspaceCapabilityRegistry } from "../security/workspaceCapabilities";

export function registerExtensionHandlers(
  workspaceCapabilities: WorkspaceCapabilityRegistry,
) {
  const authorizeFolder = (rendererId: number, folderPath?: string | null) =>
    folderPath
      ? workspaceCapabilities.assertRoot(rendererId, folderPath)
      : folderPath;
  ipcMain.handle(
    EXTENSION_IPC_CHANNELS.list,
    async (event, folderPath?: string | null): Promise<ExtensionState> => {
      return extensionHostService.getState(
        authorizeFolder(event.sender.id, folderPath),
      );
    },
  );

  ipcMain.handle(
    EXTENSION_IPC_CHANNELS.activate,
    async (
      event,
      activationEvent: string,
      folderPath?: string | null,
    ): Promise<ExtensionActionResult> => {
      return extensionHostService.activate(
        activationEvent,
        authorizeFolder(event.sender.id, folderPath),
      );
    },
  );

  ipcMain.handle(
    EXTENSION_IPC_CHANNELS.executeCommand,
    async (
      event,
      commandId: string,
      args: unknown[] = [],
      folderPath?: string | null,
    ): Promise<ExtensionCommandExecutionResult> => {
      return extensionHostService.executeCommand(
        commandId,
        args,
        authorizeFolder(event.sender.id, folderPath),
      );
    },
  );

  ipcMain.handle(
    EXTENSION_IPC_CHANNELS.setEnabled,
    async (
      event,
      extensionId: string,
      enabled: boolean,
      folderPath?: string | null,
    ): Promise<ExtensionActionResult> => {
      if (!extensionId || extensionId === "axon.builtin") {
        return {
          ok: false,
          message: "Built-in extensions cannot be disabled.",
          state: extensionHostService.getState(
            authorizeFolder(event.sender.id, folderPath),
          ),
        };
      }

      return extensionHostService.setEnabled(
        extensionId,
        enabled,
        authorizeFolder(event.sender.id, folderPath),
      );
    },
  );

  ipcMain.handle(
    EXTENSION_IPC_CHANNELS.reload,
    async (
      event,
      folderPath?: string | null,
    ): Promise<ExtensionActionResult> => {
      return extensionHostService.reload(
        authorizeFolder(event.sender.id, folderPath),
      );
    },
  );

  ipcMain.handle(
    EXTENSION_IPC_CHANNELS.marketplace,
    async (): Promise<ExtensionMarketplaceState> => {
      return extensionHostService.getMarketplaceState();
    },
  );

  ipcMain.handle(
    EXTENSION_IPC_CHANNELS.themeMarketplace,
    async (): Promise<ExtensionMarketplaceState> => {
      return extensionHostService.getMarketplaceState();
    },
  );

  ipcMain.handle(
    EXTENSION_IPC_CHANNELS.install,
    async (
      event,
      extensionId: string,
      folderPath?: string | null,
    ): Promise<ExtensionActionResult> => {
      return extensionHostService.install(
        extensionId,
        authorizeFolder(event.sender.id, folderPath),
      );
    },
  );

  ipcMain.handle(
    EXTENSION_IPC_CHANNELS.installTheme,
    async (
      event,
      extensionId: string,
      folderPath?: string | null,
    ): Promise<ExtensionActionResult> => {
      return extensionHostService.install(
        extensionId,
        authorizeFolder(event.sender.id, folderPath),
      );
    },
  );

  ipcMain.handle(
    EXTENSION_IPC_CHANNELS.openFolder,
    async (
      event,
      workspacePath?: string | null,
    ): Promise<ExtensionActionResult> => {
      const authorizedWorkspacePath = authorizeFolder(
        event.sender.id,
        workspacePath,
      );
      const userExtensionsPath = getUserExtensionsPath();
      fs.mkdirSync(userExtensionsPath, { recursive: true });
      const openError = await shell.openPath(userExtensionsPath);

      // Electron reports shell.openPath failures as a returned string instead
      // of throwing. Returning a normal action result keeps the renderer from
      // showing a vague IPC failure when Finder cannot open the folder for
      // platform or permission reasons.
      if (openError) {
        return {
          ok: false,
          message: openError,
          state: extensionHostService.getState(authorizedWorkspacePath),
        };
      }

      return {
        ok: true,
        message: "Opened user extensions folder.",
        state: extensionHostService.getState(authorizedWorkspacePath),
      };
    },
  );
}
