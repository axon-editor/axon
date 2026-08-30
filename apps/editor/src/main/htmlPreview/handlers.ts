import { ipcMain, shell } from "electron";
import { type HtmlPreviewActionResult } from "../../shared/htmlPreview";
import { HtmlPreviewServer } from "./server";
import { type WorkspaceCapabilityRegistry } from "../security/workspaceCapabilities";

export function registerHtmlPreviewHandlers(
  getServer: () => HtmlPreviewServer,
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
        const target = await getServer().getTarget(authorizedFile, root);
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
        const target = await getServer().getTarget(authorizedFile, root);
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
