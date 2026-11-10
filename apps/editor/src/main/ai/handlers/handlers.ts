/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from "node:crypto";
import { ipcMain } from "electron";
import {
  type AiChatRequest,
  type AiChatResult,
  type AiChatStreamStarted,
  type AiInlineCompletionRequest,
  type AiInlineCompletionResult,
  type AiModelInfo,
  type AiProjectContext,
  type AiPullStarted,
  type AiRuntimeStatus,
  type AiUiToolResult,
} from "../../../shared/ai/ai";
import {
  loadOpenCodeRuntime,
  mergeRuntimeStatus,
} from "../providers/opencode/models/runtime";
import {
  cancelOpenCodeRun,
  resolveOpenCodePermission,
  startOpenCodeRun,
} from "../providers/opencode/run/session";
import { readSettingsForFolder } from "../../settings/io";
import {
  cancelAgentRun,
  runAgentLoop,
} from "../agent/agentLoop";
import { resolveUiTool } from "../agent/uiToolBridge";
import { runLocalAiChat } from "../providers/localProvider";
import {
  cancelCoreModelPull,
  startCoreModelPullStream,
} from "../streaming/coreStream";
import { requestCoreInlineCompletion } from "../completion/inlineCompletion";
import { type WorkspaceCapabilityRegistry } from "../../security/workspaceCapabilities";
import { createWorkspaceDirectory } from "../../security/createWorkspaceDirectory";
import { writeWorkspaceTextFile } from "../../security/writeWorkspaceTextFile";
import { createAgentCommandController } from "../agent/agentCommandController";

interface CoreResponse<T> {
  status: "success" | "error";
  http_status: number;
  message: string;
  data: T | null;
  errors: Record<string, string[]> | null;
  code: string | null;
  request_id: string;
  meta: unknown | null;
}

function coreErrorMessage(json: CoreResponse<unknown>, fallback: string) {
  return json.message || json.code || fallback;
}

async function listCoreAiModels(input: {
  axonCorePort: string;
  axonCoreToken: string;
  model: string;
}): Promise<AiModelInfo[]> {
  const response = await fetch(
    `http://127.0.0.1:${input.axonCorePort}/ai/models?model=${encodeURIComponent(input.model)}`,
    { headers: { Authorization: `Bearer ${input.axonCoreToken}` } },
  );
  const json = (await response.json()) as CoreResponse<AiModelInfo[]>;
  if (!response.ok || json.status !== "success") {
    throw new Error(
      coreErrorMessage(json, `axon-core returned ${response.status}`),
    );
  }
  return json.data ?? [];
}

async function getCoreAiRuntimeStatus(input: {
  axonCorePort: string;
  axonCoreToken: string;
  model: string;
}): Promise<AiRuntimeStatus> {
  const response = await fetch(
    `http://127.0.0.1:${input.axonCorePort}/ai/runtime?model=${encodeURIComponent(input.model)}`,
    { headers: { Authorization: `Bearer ${input.axonCoreToken}` } },
  );
  const json = (await response.json()) as CoreResponse<AiRuntimeStatus>;
  if (!response.ok || json.status !== "success" || !json.data) {
    throw new Error(
      coreErrorMessage(json, `axon-core returned ${response.status}`),
    );
  }
  return json.data;
}

async function getCoreAiProjectContext(input: {
  axonCorePort: string;
  axonCoreToken: string;
  folderPath: string;
}): Promise<AiProjectContext> {
  const response = await fetch(
    `http://127.0.0.1:${input.axonCorePort}/ai/project-context?root=${encodeURIComponent(input.folderPath)}`,
    { headers: { Authorization: `Bearer ${input.axonCoreToken}` } },
  );
  const json = (await response.json()) as CoreResponse<AiProjectContext>;
  if (!response.ok || json.status !== "success" || !json.data) {
    throw new Error(
      coreErrorMessage(json, `axon-core returned ${response.status}`),
    );
  }
  return json.data;
}

async function getMergedAiRuntimeStatus(input: {
  axonCorePort: string;
  axonCoreToken: string;
  folderPath: string | null;
  model: string;
}): Promise<AiRuntimeStatus> {
  // Local and OpenCode status are independent. A missing local runtime must not
  // hide OpenCode models, and a missing OpenCode CLI must not make the local
  // panel look broken. Each side fails independently and the merge decides what
  // the renderer can offer.
  const [core, opencode] = await Promise.all([
    getCoreAiRuntimeStatus({
      axonCorePort: input.axonCorePort,
      axonCoreToken: input.axonCoreToken,
      model: input.model,
    }).catch(() => null),
    loadOpenCodeRuntime(input.folderPath),
  ]);
  return mergeRuntimeStatus(core, opencode, input.model);
}

export function registerAiHandlers(deps: {
  axonCorePort: string;
  axonCoreToken: string;
  workspaceCapabilities: WorkspaceCapabilityRegistry;
}) {
  const authorizeFolder = (rendererId: number, folderPath?: string | null) =>
    folderPath
      ? deps.workspaceCapabilities.assertRoot(rendererId, folderPath)
      : folderPath;
  const authorizeChatRequest = (rendererId: number, request: AiChatRequest) => {
    const folderPath = authorizeFolder(rendererId, request.folderPath) ?? null;
    const activeFilePath = request.activeFilePath
      ? deps.workspaceCapabilities.assertReadablePath(
          rendererId,
          request.activeFilePath,
        )
      : request.activeFilePath;
    const files = request.files.map((file) => ({
      ...file,
      path: deps.workspaceCapabilities.assertReadablePath(
        rendererId,
        file.path,
      ),
    }));
    return { ...request, folderPath, activeFilePath, files };
  };
  const authorizeInlineCompletionRequest = (
    rendererId: number,
    request: AiInlineCompletionRequest,
  ) => {
    const folderPath = authorizeFolder(rendererId, request.folderPath) ?? null;
    const filePath = deps.workspaceCapabilities.assertReadablePath(
      rendererId,
      request.filePath,
    );
    return { ...request, folderPath, filePath };
  };

  ipcMain.handle(
    "ai:getRuntimeStatus",
    async (event, folderPath?: string | null): Promise<AiRuntimeStatus> => {
      const authorizedFolder = authorizeFolder(event.sender.id, folderPath);
      const settings = await readSettingsForFolder(authorizedFolder);
      return getMergedAiRuntimeStatus({
        axonCorePort: deps.axonCorePort,
        axonCoreToken: deps.axonCoreToken,
        folderPath: authorizedFolder ?? null,
        model: settings.ai.model,
      });
    },
  );

  ipcMain.handle(
    "ai:listModels",
    async (event, folderPath?: string | null): Promise<AiModelInfo[]> => {
      const authorizedFolder = authorizeFolder(event.sender.id, folderPath);
      const settings = await readSettingsForFolder(authorizedFolder);
      const [coreModels, opencode] = await Promise.all([
        listCoreAiModels({
          axonCorePort: deps.axonCorePort,
          axonCoreToken: deps.axonCoreToken,
          model: settings.ai.model,
        }).catch(() => [] as AiModelInfo[]),
        loadOpenCodeRuntime(authorizedFolder ?? null),
      ]);
      return [...coreModels, ...opencode.models];
    },
  );

  ipcMain.handle(
    "ai:getProjectContext",
    async (event, folderPath: string): Promise<AiProjectContext> => {
      return getCoreAiProjectContext({
        axonCorePort: deps.axonCorePort,
        axonCoreToken: deps.axonCoreToken,
        folderPath: deps.workspaceCapabilities.assertRoot(
          event.sender.id,
          folderPath,
        ),
      });
    },
  );

  ipcMain.handle(
    "ai:chat",
    async (event, request: AiChatRequest): Promise<AiChatResult> => {
      // AI requests stay in the main process because model endpoints, future
      // credentials, and provider routing are privileged integration details.
      // The renderer sends user intent and prepared context; the main process
      // decides which provider can execute it and returns a safe result shape.
      const authorizedRequest = authorizeChatRequest(event.sender.id, request);
      const settings = await readSettingsForFolder(
        authorizedRequest.folderPath,
      );
      return runLocalAiChat(authorizedRequest, settings);
    },
  );

  ipcMain.handle(
    "ai:chatStream",
    async (event, request: AiChatRequest): Promise<AiChatStreamStarted> => {
      const authorizedRequest = authorizeChatRequest(event.sender.id, request);
      const settings = await readSettingsForFolder(
        authorizedRequest.folderPath,
      );
      if (!settings.ai.enabled) {
        return {
          success: false,
          requestId: "",
          message: "Axon Agent is disabled in settings.",
        };
      }

      const selectedModel =
        authorizedRequest.model?.trim() || settings.ai.model;
      const backend =
        authorizedRequest.backend ??
        (authorizedRequest.providerID ? "opencode" : "axon");
      if (backend === "opencode") {
        if (!authorizedRequest.folderPath) {
          return {
            success: false,
            requestId: "",
            message: "Open a folder before using OpenCode.",
          };
        }

        const requestId = randomUUID();
        void startOpenCodeRun({
          requestId,
          request: { ...authorizedRequest, model: selectedModel },
          send: (payload) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send("ai:chatStreamEvent", payload);
            }
          },
        });
        return { success: true, requestId };
      }

      const rendererId = event.sender.id;
      const commandController = authorizedRequest.folderPath
        ? createAgentCommandController({
            registry: deps.workspaceCapabilities,
            rendererId,
            workspaceRoot: authorizedRequest.folderPath,
            mode: settings.ai.commandPermissionMode,
          })
        : undefined;
      const { requestId } = runAgentLoop({
        axonCorePort: deps.axonCorePort,
        axonCoreToken: deps.axonCoreToken,
        request: {
          ...authorizedRequest,
          model: selectedModel,
        },
        send: (payload) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send("ai:chatStreamEvent", payload);
          }
        },
        writeTextFile: (filePath, content) =>
          writeWorkspaceTextFile(
            deps.workspaceCapabilities,
            rendererId,
            filePath,
            content,
          ),
        createDirectory: (directoryPath) =>
          createWorkspaceDirectory(
            deps.workspaceCapabilities,
            rendererId,
            directoryPath,
          ),
        commandController,
      });

      return { success: true, requestId };
    },
  );

  ipcMain.handle(
    "ai:uiToolResult",
    (_event, result: AiUiToolResult): boolean => {
      // OpenCode permissions are parked in the OpenCode run registry. Only fall
      // back to the local agent bridge when the call id does not belong to one
      // of those pending requests.
      if (resolveOpenCodePermission(result)) return true;
      return resolveUiTool(result);
    },
  );

  ipcMain.handle(
    "ai:inlineCompletion",
    async (
      event,
      request: AiInlineCompletionRequest,
    ): Promise<AiInlineCompletionResult> => {
      const authorizedRequest = authorizeInlineCompletionRequest(
        event.sender.id,
        request,
      );
      const settings = await readSettingsForFolder(
        authorizedRequest.folderPath,
      );
      if (!settings.ai.enabled || !settings.ai.inlineCompletionsEnabled) {
        return {
          success: true,
          completion: "",
          message: "Inline AI completion is disabled in settings.",
          modelLabel: settings.ai.model,
          providerLabel: "Axon models",
        };
      }

      return requestCoreInlineCompletion({
        axonCorePort: deps.axonCorePort,
        axonCoreToken: deps.axonCoreToken,
        request: {
          ...authorizedRequest,
          model: authorizedRequest.model?.trim() || settings.ai.model,
        },
      });
    },
  );

  ipcMain.handle(
    "ai:cancelChatStream",
    (_event, requestId: string): boolean => {
      if (cancelOpenCodeRun(requestId)) return true;
      return cancelAgentRun(requestId);
    },
  );

  ipcMain.handle(
    "ai:pullModel",
    async (event, model: string): Promise<AiPullStarted> => {
      if (!model.trim()) {
        return {
          success: false,
          requestId: "",
          message: "Model is required.",
        };
      }

      // OpenCode models are authenticated and managed by the OpenCode server.
      // There is no Ollama-style download for them, so the pull button must not
      // hand them to axon-core's pull stream.
      if (model.includes("/")) {
        return {
          success: false,
          requestId: "",
          message: "OpenCode models are managed by OpenCode.",
        };
      }

      return startCoreModelPullStream({
        axonCorePort: deps.axonCorePort,
        axonCoreToken: deps.axonCoreToken,
        model,
        send: (payload) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send("ai:pullEvent", payload);
          }
        },
      });
    },
  );

  ipcMain.handle("ai:cancelPullModel", (_event, requestId: string): boolean => {
    return cancelCoreModelPull(requestId);
  });
}
