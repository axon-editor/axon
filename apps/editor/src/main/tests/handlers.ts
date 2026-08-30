import { ipcMain } from "electron";
import fs from "fs";
import { type TestManager } from "./tests";
import {
  type TestDiscoveryResult,
  type TestRunResult,
  type TestStopResult,
} from "../../shared/tests";
import { type WorkspaceCapabilityRegistry } from "../security/workspaceCapabilities";

export function registerTestHandlers(
  testManager: TestManager,
  workspaceCapabilities: WorkspaceCapabilityRegistry,
) {
  const boundRenderers = new Set<number>();
  const bindRendererLifecycle = (sender: Electron.WebContents) => {
    if (boundRenderers.has(sender.id)) return;
    boundRenderers.add(sender.id);
    sender.once("destroyed", () => {
      boundRenderers.delete(sender.id);
      testManager.stopAll(sender.id);
    });
  };
  ipcMain.handle(
    "tests:discover",
    async (event, folderPath: string): Promise<TestDiscoveryResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a workspace before discovering tests.",
          providers: [],
          items: [],
        };
      }

      return testManager.discover(
        workspaceCapabilities.assertRoot(event.sender.id, folderPath),
      );
    },
  );

  ipcMain.handle(
    "tests:run",
    async (
      event,
      folderPath: string,
      providerId: string,
      targetId?: string | null,
    ): Promise<TestRunResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a workspace before running tests.",
          runId: null,
          provider: null,
          targetId: targetId ?? null,
        };
      }

      bindRendererLifecycle(event.sender);
      return testManager.run(
        workspaceCapabilities.assertRoot(event.sender.id, folderPath),
        providerId,
        targetId,
        (channel, payload) => {
          if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
        },
        event.sender.id,
      );
    },
  );

  ipcMain.handle("tests:stopAll", async (event): Promise<TestStopResult> => {
    return testManager.stopAll(event.sender.id);
  });
}
