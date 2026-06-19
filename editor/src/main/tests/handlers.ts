import { ipcMain } from "electron";
import fs from "fs";
import { type TestManager } from "./tests";
import {
  type TestDiscoveryResult,
  type TestRunResult,
} from "../../shared/tests";

export function registerTestHandlers(testManager: TestManager) {
  ipcMain.handle(
    "tests:discover",
    async (_event, folderPath: string): Promise<TestDiscoveryResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a workspace before discovering tests.",
          providers: [],
        };
      }

      return testManager.discover(folderPath);
    },
  );

  ipcMain.handle(
    "tests:run",
    async (
      _event,
      folderPath: string,
      providerId: string,
    ): Promise<TestRunResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a workspace before running tests.",
          runId: null,
          provider: null,
        };
      }

      return testManager.run(folderPath, providerId);
    },
  );
}
