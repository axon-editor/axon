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

      return testManager.run(
        workspaceCapabilities.assertRoot(event.sender.id, folderPath),
        providerId,
        targetId,
      );
    },
  );

  ipcMain.handle("tests:stopAll", async (): Promise<TestStopResult> => {
    return testManager.stopAll();
  });
}
