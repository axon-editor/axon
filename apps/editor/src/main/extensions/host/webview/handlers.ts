/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcMain } from "electron";
import { type ExtensionWebviewActionResult } from "../../../../shared/extensionWebview";
import { extensionHostService } from "../service";
import { type ExtensionWebviewServer } from "./server";

export function registerExtensionWebviewHandlers(
  getServer: (
    rendererId: number,
    sendToRenderer: (channel: string, payload?: unknown) => void,
  ) => ExtensionWebviewServer,
) {
  ipcMain.handle(
    "extensions:getWebviewTarget",
    async (
      event,
      extensionId: string,
    ): Promise<ExtensionWebviewActionResult> => {
      try {
        if (!extensionId) {
          return { ok: false, message: "No extension was specified." };
        }

        // The renderer can only name an extension by id. Its package folder is
        // resolved here against the extension host state, so the webview server
        // never trusts a renderer-supplied path.
        const state = await extensionHostService.getState(null);
        const extension = state.extensions.find(
          (candidate) => candidate.id === extensionId && candidate.enabled,
        );
        if (!extension) {
          return {
            ok: false,
            message: `Extension "${extensionId}" is not enabled.`,
          };
        }

        const server = getServer(event.sender.id, (channel, payload) => {
          if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
        });
        const target = await server.getTarget(extension.id, extension.path);
        return { ok: true, target };
      } catch (err) {
        return {
          ok: false,
          message:
            err instanceof Error
              ? err.message
              : "Failed to open the extension webview.",
        };
      }
    },
  );
}