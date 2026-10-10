/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcMain } from "electron";
import path from "node:path";

import { detectPythonVirtualEnvForWorkspace } from "../lsp/discovery/pythonEnvironment";
import { requestKernelTicket } from "./hostClient";

export interface CreateKernelTicketRequest {
  sessionId: string;
  notebookPath: string;
}

export interface NotebookHandlerDependencies {
  axonKernelPort: string;
  axonKernelToken: string;
  axonKernelControlPath?: string | null;
  ensureKernelHostReady?: () => Promise<void>;
  assertWorkspacePath: (rendererId: number, candidatePath: string) => string;
  resolveWorkspaceRoot: (rendererId: number, candidatePath: string) => string;
}

export function registerNotebookHandlers(deps: NotebookHandlerDependencies) {
  ipcMain.handle(
    "notebook:createKernelTicket",
    async (
      event,
      request: CreateKernelTicketRequest,
    ): Promise<string> => {
      const rendererId = event.sender.id;
      // The renderer only names a notebook inside a workspace it already opened;
      // main resolves the real workspace root and the interpreter so a kernel can
      // never be pointed outside the granted folder.
      const notebookPath = deps.assertWorkspacePath(
        rendererId,
        request?.notebookPath ?? "",
      );
      const workspaceRoot = deps.resolveWorkspaceRoot(rendererId, notebookPath);

      const { interpreterPath } =
        await detectPythonVirtualEnvForWorkspace(workspaceRoot);
      if (!interpreterPath) {
        throw new Error(
          "Axon could not find a Python interpreter for this workspace. Install Python or select an interpreter and try again.",
        );
      }

      // A kernel requested while the packaged host is still starting, or right
      // after an unexpected host exit, must wait for recovery here. Making ticket
      // creation the recovery boundary stops restored notebooks from retrying a
      // dead control socket forever after a folder switch.
      await deps.ensureKernelHostReady?.();

      const response = await requestKernelTicket(
        {
          controlPath: deps.axonKernelControlPath,
          port: deps.axonKernelPort,
          token: deps.axonKernelToken,
        },
        {
          sessionId: request.sessionId,
          // The kernel starts in the notebook's own directory, matching Jupyter's
          // default so relative data reads resolve beside the notebook.
          cwd: path.dirname(notebookPath),
          workspaceRoot,
          notebookPath,
          interpreter: interpreterPath,
          kernelName: "python3",
        },
      );
      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `Kernel host rejected ticket request (${response.status}).`,
        );
      }
      const ticket = response.payload.data?.ticket;
      if (response.payload.status !== "ok" || !ticket) {
        throw new Error(
          response.payload.error ?? "Kernel host returned an invalid ticket.",
        );
      }
      return `ws://127.0.0.1:${deps.axonKernelPort}/kernel?sessionId=${encodeURIComponent(
        request.sessionId,
      )}&ticket=${encodeURIComponent(ticket)}`;
    },
  );
}
