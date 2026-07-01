import { ipcMain } from "electron";
import { type TaskManager } from "./tasks";

export function registerTaskHandlers(taskManager: TaskManager) {
  ipcMain.handle("tasks:list", async (_event, folderPath: string) => {
    if (!folderPath || !folderPath.length) return [];
    return taskManager.getWorkspaceTasks(folderPath);
  });

  ipcMain.handle(
    "tasks:run",
    async (_event, folderPath: string, taskId: string) => {
      if (!folderPath || !folderPath.length) {
        throw new Error("Open a workspace before running tasks.");
      }
      return taskManager.startWorkspaceTask(folderPath, taskId);
    },
  );
}
