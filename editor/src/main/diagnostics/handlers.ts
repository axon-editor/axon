import { ipcMain } from "electron";
import { runProjectDiagnostics } from "./diagnostics";

export function registerDiagnosticsHandlers() {
  ipcMain.handle("diagnostics:project", async (_event, folderPath: string) => {
    return runProjectDiagnostics(folderPath);
  });
}
