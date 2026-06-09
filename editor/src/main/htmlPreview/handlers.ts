import { ipcMain, shell } from "electron";
import { type HtmlPreviewActionResult } from "../../shared/htmlPreview";
import { HtmlPreviewServer } from "./server";

export function registerHtmlPreviewHandlers(getServer: () => HtmlPreviewServer) {
  ipcMain.handle(
    "htmlPreview:getTarget",
    async (
      _event,
      filePath: string,
      folderPath?: string | null,
    ): Promise<HtmlPreviewActionResult> => {
      try {
        const target = await getServer().getTarget(filePath, folderPath);
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
      _event,
      filePath: string,
      folderPath?: string | null,
    ): Promise<HtmlPreviewActionResult> => {
      try {
        const target = await getServer().getTarget(filePath, folderPath);
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
