import { ipcMain, shell } from "electron";
import { type HtmlPreviewActionResult } from "../../shared/htmlPreview";
import { HtmlPreviewServer } from "./server";
import { type WorkspaceCapabilityRegistry } from "../security/workspaceCapabilities";

export function registerHtmlPreviewHandlers(
  getServer: (
    rendererId: number,
    sendToRenderer: (channel: string, payload?: unknown) => void,
  ) => HtmlPreviewServer,
  workspaceCapabilities: WorkspaceCapabilityRegistry,
) {
  ipcMain.handle(
    "htmlPreview:getTarget",
    async (
      event,
      filePath: string,
      folderPath?: string | null,
    ): Promise<HtmlPreviewActionResult> => {
      try {
        if (!folderPath) {
          throw new Error("Open a workspace before starting HTML preview.");
        }
        const root = workspaceCapabilities.assertRoot(
          event.sender.id,
          folderPath,
        );
        const authorizedFile = workspaceCapabilities.assertPath(
          event.sender.id,
          filePath,
        );
        const server = getServer(event.sender.id, (channel, payload) => {
          if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
        });
        const target = await server.getTarget(authorizedFile, root);
        return { ok: true, target };
      } catch (err) {
        return {
          ok: false,
          message:
            err instanceof Error ? err.message : "Failed to start HTML preview.",
        };
      }
    },
  );

  ipcMain.handle(
    "htmlPreview:openExternal",
    async (
      event,
      filePath: string,
      folderPath?: string | null,
    ): Promise<HtmlPreviewActionResult> => {
      try {
        if (!folderPath) {
          throw new Error("Open a workspace before starting HTML preview.");
        }
        const root = workspaceCapabilities.assertRoot(
          event.sender.id,
          folderPath,
        );
        const authorizedFile = workspaceCapabilities.assertPath(
          event.sender.id,
          filePath,
        );
        const server = getServer(event.sender.id, (channel, payload) => {
          if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
        });
        const target = await server.getTarget(authorizedFile, root);
        await shell.openExternal(target.url);
        return { ok: true, target };
      } catch (err) {
        return {
          ok: false,
          message:
            err instanceof Error ? err.message : "Failed to open HTML preview.",
        };
      }
    },
  );
}
