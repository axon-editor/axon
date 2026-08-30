import { ipcMain } from "electron";
import { type TaskManager } from "./tasks";
import { type WorkspaceCapabilityRegistry } from "../security/workspaceCapabilities";

export function registerTaskHandlers(
  taskManager: TaskManager,
  workspaceCapabilities: WorkspaceCapabilityRegistry,
) {
  const boundRenderers = new Set<number>();
  const bindRendererLifecycle = (sender: Electron.WebContents) => {
    if (boundRenderers.has(sender.id)) return;
    boundRenderers.add(sender.id);
    sender.once("destroyed", () => {
      boundRenderers.delete(sender.id);
      taskManager.stopAll(sender.id);
    });
  };
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
      bindRendererLifecycle(event.sender);
      return taskManager.startWorkspaceTask(
        workspaceCapabilities.assertRoot(event.sender.id, folderPath),
        taskId,
        (channel, payload) => {
          if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
        },
        event.sender.id,
      );
    },
  );
}
