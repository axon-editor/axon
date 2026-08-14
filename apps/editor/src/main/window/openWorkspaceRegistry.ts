import path from "node:path";
import { BrowserWindow, ipcMain } from "electron";
import { type OpenWorkspaceFolder } from "../../shared/app";

interface WindowWorkspaceState {
  folders: Array<{ path: string; name: string; comparisonKey: string }>;
  window: BrowserWindow;
}

function getComparisonKey(folderPath: string) {
  const normalized = path.resolve(folderPath).replace(/\\/g, "/");
  return process.platform === "linux" ? normalized : normalized.toLowerCase();
}

function normalizeFolderPaths(folderPaths: unknown) {
  if (!Array.isArray(folderPaths)) return [];

  const seen = new Set<string>();
  const folders: WindowWorkspaceState["folders"] = [];
  for (const candidate of folderPaths.slice(0, 64)) {
    if (typeof candidate !== "string" || !path.isAbsolute(candidate)) continue;

    const resolvedPath = path.resolve(candidate);
    const comparisonKey = getComparisonKey(resolvedPath);
    if (seen.has(comparisonKey)) continue;
    seen.add(comparisonKey);
    folders.push({
      path: resolvedPath,
      name: path.basename(resolvedPath) || resolvedPath,
      comparisonKey,
    });
  }

  return folders;
}

export class OpenWorkspaceRegistry {
  private readonly windows = new Map<number, WindowWorkspaceState>();

  registerHandlers() {
    ipcMain.handle("app:updateOpenWorkspaceFolders", (event, folderPaths) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window || window.isDestroyed()) return [];

      this.windows.set(event.sender.id, {
        folders: normalizeFolderPaths(folderPaths),
        window,
      });
      this.broadcast();
      return this.listFor(event.sender.id);
    });

    ipcMain.handle("app:listOpenWorkspaceFolders", (event) =>
      this.listFor(event.sender.id),
    );

    ipcMain.handle(
      "app:focusOpenWorkspaceWindow",
      (_event, rendererId: number) => {
        if (!Number.isInteger(rendererId)) return false;
        const target = this.windows.get(rendererId)?.window;
        if (!target || target.isDestroyed()) return false;

        if (target.isMinimized()) target.restore();
        target.show();
        target.focus();
        return true;
      },
    );
  }

  release(rendererId: number) {
    if (!this.windows.delete(rendererId)) return;
    this.broadcast();
  }

  private listFor(requestingRendererId: number): OpenWorkspaceFolder[] {
    const folders = new Map<string, OpenWorkspaceFolder>();

    // A folder can be open in more than one window. I prefer the requesting
    // window as its owner so selecting that row switches roots locally. For
    // every other duplicate, one stable owner is enough to focus the existing
    // Axon window without presenting the same path multiple times.
    const states = [...this.windows.entries()].sort(([left], [right]) => {
      if (left === requestingRendererId) return -1;
      if (right === requestingRendererId) return 1;
      return left - right;
    });

    for (const [rendererId, state] of states) {
      if (state.window.isDestroyed()) continue;
      for (const folder of state.folders) {
        if (folders.has(folder.comparisonKey)) continue;
        folders.set(folder.comparisonKey, {
          path: folder.path,
          name: folder.name,
          rendererId,
          currentWindow: rendererId === requestingRendererId,
        });
      }
    }

    return [...folders.values()];
  }

  private broadcast() {
    for (const [rendererId, state] of this.windows) {
      if (
        state.window.isDestroyed() ||
        state.window.webContents.isDestroyed()
      ) {
        this.windows.delete(rendererId);
        continue;
      }
      state.window.webContents.send(
        "app:openWorkspaceFoldersChanged",
        this.listFor(rendererId),
      );
    }
  }
}
