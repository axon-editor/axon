import { ipcMain } from "electron";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { type EditorDiagnostic } from "../../shared/diagnostics";
import { runProjectDiagnostics } from "./diagnostics";
import { type WorkspaceCapabilityRegistry } from "../security/workspaceCapabilities";

interface AgentDiagnosticsSnapshot {
  workspace: string;
  updatedAt: string;
  diagnostics: EditorDiagnostic[];
}

async function writeAgentDiagnosticsSnapshot(
  snapshot: AgentDiagnosticsSnapshot,
) {
  const axonDir = path.join(os.homedir(), ".axon");

  // axon fix runs from a normal terminal process, so it cannot read renderer
  // memory directly. I persist the current Problems snapshot in Axon's user
  // state directory using the same normalized diagnostic shape the UI shows.
  // If this write fails, the editor should keep running; the CLI will report
  // that no diagnostics are available for the current workspace.
  await fs.mkdir(axonDir, { recursive: true });
  await fs.writeFile(
    path.join(axonDir, "diagnostics.json"),
    JSON.stringify(snapshot, null, 2),
    "utf8",
  );
}

export function registerDiagnosticsHandlers(
  workspaceCapabilities: WorkspaceCapabilityRegistry,
) {
  ipcMain.handle("diagnostics:project", async (event, folderPath: string) => {
    return runProjectDiagnostics(
      workspaceCapabilities.assertRoot(event.sender.id, folderPath),
    );
  });

  ipcMain.handle(
    "diagnostics:exportAgent",
    async (
      event,
      snapshot: AgentDiagnosticsSnapshot,
    ): Promise<{ ok: boolean }> => {
      const workspace = workspaceCapabilities.assertRoot(
        event.sender.id,
        snapshot.workspace,
      );
      await writeAgentDiagnosticsSnapshot({ ...snapshot, workspace });
      return { ok: true };
    },
  );
}
