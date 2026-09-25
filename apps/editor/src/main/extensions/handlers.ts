/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import { ipcMain, shell } from "electron";
import { EXTENSION_IPC_CHANNELS } from "@axon/ipc";
import {
  type ExtensionActionResult,
  type ExtensionCommandExecutionResult,
  type ExtensionMarketplaceState,
  type ExtensionReadmeResult,
  type ExtensionReadmeAssetUrlsResult,
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
      return await extensionHostService.getState(
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
      return await extensionHostService.activate(
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
      return await extensionHostService.executeCommand(
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
          state: await extensionHostService.getState(
            authorizeFolder(event.sender.id, folderPath),
          ),
        };
      }

      return await extensionHostService.setEnabled(
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
      return await extensionHostService.reload(
        authorizeFolder(event.sender.id, folderPath),
      );
    },
  );

  ipcMain.handle(
    EXTENSION_IPC_CHANNELS.marketplace,
    async (): Promise<ExtensionMarketplaceState> => {
      return await extensionHostService.getMarketplaceState();
    },
  );

  ipcMain.handle(
    EXTENSION_IPC_CHANNELS.themeMarketplace,
    async (): Promise<ExtensionMarketplaceState> => {
      return await extensionHostService.getMarketplaceState();
    },
  );

  ipcMain.handle(
    EXTENSION_IPC_CHANNELS.install,
    async (
      event,
      extensionId: string,
      folderPath?: string | null,
    ): Promise<ExtensionActionResult> => {
      return await extensionHostService.install(
        extensionId,
        authorizeFolder(event.sender.id, folderPath),
      );
    },
  );

  ipcMain.handle(
    EXTENSION_IPC_CHANNELS.uninstall,
    async (
      event,
      extensionId: string,
      folderPath?: string | null,
    ): Promise<ExtensionActionResult> => {
      return await extensionHostService.uninstall(
        extensionId,
        authorizeFolder(event.sender.id, folderPath),
      );
    },
  );

  ipcMain.handle(
    EXTENSION_IPC_CHANNELS.getReadme,
    async (
      _event,
      extensionId: string,
    ): Promise<ExtensionReadmeResult> => {
      return extensionHostService.getReadme(extensionId);
    },
  );

  ipcMain.handle(
    EXTENSION_IPC_CHANNELS.getReadmeAssetUrls,
    async (
      event,
      extensionId: string,
      relativePaths: string[],
    ): Promise<ExtensionReadmeAssetUrlsResult> => {
      return extensionHostService.getReadmeAssetUrls(
        event.sender.id,
        extensionId,
        relativePaths,
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
      return await extensionHostService.install(
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
          state: await extensionHostService.getState(authorizedWorkspacePath),
        };
      }

      return {
        ok: true,
        message: "Opened user extensions folder.",
        state: await extensionHostService.getState(authorizedWorkspacePath),
      };
    },
  );
}
