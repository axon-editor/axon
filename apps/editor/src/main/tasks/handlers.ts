import { ipcMain } from "electron";
import { type TaskManager } from "./tasks";
import { type WorkspaceCapabilityRegistry } from "../security/workspaceCapabilities";

export function registerTaskHandlers(
  taskManager: TaskManager,
  workspaceCapabilities: WorkspaceCapabilityRegistry,
) {
  ipcMain.handle("tasks:list", async (event, folderPath: string) => {
    if (!folderPath || !folderPath.length) return [];
    return taskManager.getWorkspaceTasks(
      workspaceCapabilities.assertRoot(event.sender.id, folderPath),
    );
  });

  ipcMain.handle(
    "tasks:run",
    async (event, folderPath: string, taskId: string) => {
      if (!folderPath || !folderPath.length) {
        throw new Error("Open a workspace before running tasks.");
      }
      return taskManager.startWorkspaceTask(
        workspaceCapabilities.assertRoot(event.sender.id, folderPath),
        taskId,
      );
    },
  );
}
