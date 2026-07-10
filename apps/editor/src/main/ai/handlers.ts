import { ipcMain } from "electron";
import {
  type AiChatRequest,
  type AiChatResult,
  type AiChatStreamStarted,
  type AiModelInfo,
  type AiProjectContext,
  type AiPullStarted,
  type AiRuntimeStatus,
} from "../../shared/ai";
import { readSettingsForFolder } from "../settings/io";
import { runLocalAiChat } from "./localProvider";
import {
  cancelCoreAiStream,
  cancelCoreModelPull,
  startCoreAiStream,
  startCoreModelPullStream,
} from "./coreStream";

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
    throw new Error(coreErrorMessage(json, `axon-core returned ${response.status}`));
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
    throw new Error(coreErrorMessage(json, `axon-core returned ${response.status}`));
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
    throw new Error(coreErrorMessage(json, `axon-core returned ${response.status}`));
  }
  return json.data;
}

export function registerAiHandlers(deps: {
  axonCorePort: string;
  axonCoreToken: string;
}) {
  ipcMain.handle(
    "ai:getRuntimeStatus",
    async (_event, folderPath?: string | null): Promise<AiRuntimeStatus> => {
      const settings = await readSettingsForFolder(folderPath);
      return getCoreAiRuntimeStatus({
        axonCorePort: deps.axonCorePort,
        axonCoreToken: deps.axonCoreToken,
        model: settings.ai.model,
      });
    },
  );

  ipcMain.handle(
    "ai:listModels",
    async (_event, folderPath?: string | null): Promise<AiModelInfo[]> => {
      const settings = await readSettingsForFolder(folderPath);
      return listCoreAiModels({
        axonCorePort: deps.axonCorePort,
        axonCoreToken: deps.axonCoreToken,
        model: settings.ai.model,
      });
    },
  );

  ipcMain.handle(
    "ai:getProjectContext",
    async (_event, folderPath: string): Promise<AiProjectContext> => {
      return getCoreAiProjectContext({
        axonCorePort: deps.axonCorePort,
        axonCoreToken: deps.axonCoreToken,
        folderPath,
      });
    },
  );

  ipcMain.handle(
    "ai:chat",
    async (_event, request: AiChatRequest): Promise<AiChatResult> => {
      // AI requests stay in the main process because model endpoints, future
      // credentials, and provider routing are privileged integration details.
      // The renderer sends user intent and prepared context; the main process
      // decides which provider can execute it and returns a safe result shape.
      const settings = await readSettingsForFolder(request.folderPath);
      return runLocalAiChat(request, settings);
    },
  );

  ipcMain.handle(
    "ai:chatStream",
    async (event, request: AiChatRequest): Promise<AiChatStreamStarted> => {
      const settings = await readSettingsForFolder(request.folderPath);
      if (!settings.ai.enabled) {
        return {
          success: false,
          requestId: "",
          message: "Axon Agent is disabled in settings.",
        };
      }

      return startCoreAiStream({
        axonCorePort: deps.axonCorePort,
        axonCoreToken: deps.axonCoreToken,
        request: {
          ...request,
          model: request.model?.trim() || settings.ai.model,
        },
        send: (payload) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send("ai:chatStreamEvent", payload);
          }
        },
      });
    },
  );

  ipcMain.handle("ai:cancelChatStream", (_event, requestId: string): boolean => {
    return cancelCoreAiStream(requestId);
  });

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
