/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type AiModelInfo,
  type AiRuntimeStatus,
} from "../../../../../shared/ai/ai";
import { detectOpenCodeBinary } from "../binary/detect";
import { createOpenCodeClient } from "../client/api";
import {
  type OpenCodeModel,
  type OpenCodeProvider,
} from "../client/types";
import { ensureOpenCodeServer } from "../server/lifecycle";
import { watchOpenCodeProviders } from "../server/providerWatcher";

export interface OpenCodeRuntime {
  installed: boolean;
  running: boolean;
  models: AiModelInfo[];
  detail: string;
  installHint: string;
}

function mapOpenCodeModels(
  models: OpenCodeModel[],
  providers: OpenCodeProvider[],
): AiModelInfo[] {
  const providerNames = new Map(
    providers.map((provider) => [provider.id, provider.name]),
  );

  const mapped = models
    .filter((model) => model.enabled !== false && model.status !== "deprecated")
    .filter((model) => !model.type || model.type === "chat")
    .map((model) => {
      const modelID = model.modelID ?? model.id;
      const providerLabel =
        providerNames.get(model.providerID) ?? model.providerID;
      const requiresAccount =
        model.providerID === "opencode-go" && !modelID.includes("free");
      return {
        id: `${model.providerID}/${modelID}`,
        label: model.name ?? model.id,
        description: `${providerLabel} · ${model.capabilities?.tools ? "tools" : "text"}${requiresAccount ? " · account" : ""}`,
        providerLabel,
        available: true,
        compatibility: "great" as const,
        backend: "opencode" as const,
        providerID: model.providerID,
        modelID,
      };
    });

  // Free models are the reason Axon exposes OpenCode without user auth. Put
  // them first so the picker's first available entry is usually usable.
  mapped.sort((left, right) => {
    const leftFree = left.id.includes("free") ? 0 : 1;
    const rightFree = right.id.includes("free") ? 0 : 1;
    return leftFree - rightFree || left.label.localeCompare(right.label);
  });

  const seen = new Set<string>();
  return mapped.filter((model) => {
    if (seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

export async function loadOpenCodeRuntime(
  folderPath: string | null,
): Promise<OpenCodeRuntime> {
  const binary = await detectOpenCodeBinary();
  if (!binary) {
    // The requirement is to hide OpenCode entirely when the CLI is absent.
    // Returning empty models and empty copy keeps the local runtime panel from
    // showing a download prompt for a backend the user did not ask for.
    return { installed: false, running: false, models: [], detail: "", installHint: "" };
  }

  if (!folderPath) {
    return {
      installed: true,
      running: false,
      models: [],
      detail: "Open a folder to use OpenCode.",
      installHint: "",
    };
  }

  try {
    const server = await ensureOpenCodeServer(folderPath);
    watchOpenCodeProviders(server);
    const client = createOpenCodeClient(server);
    const [modelResponse, providerResponse] = await Promise.all([
      client.models(),
      client.providers(),
    ]);
    return {
      installed: true,
      running: true,
      models: mapOpenCodeModels(modelResponse.data, providerResponse.data),
      detail: `OpenCode ${binary.version}`,
      installHint: "",
    };
  } catch (error) {
    return {
      installed: true,
      running: false,
      models: [],
      detail:
        error instanceof Error
          ? error.message
          : "OpenCode could not be started.",
      installHint: "Check the OpenCode installation and try again.",
    };
  }
}

export function mergeRuntimeStatus(
  core: AiRuntimeStatus | null,
  opencode: OpenCodeRuntime | null,
  selectedModel: string,
): AiRuntimeStatus {
  const coreStatus: AiRuntimeStatus = core ?? {
    installed: false,
    running: false,
    startedByAxon: false,
    providerLabel: "Axon models",
    selectedModel,
    selectedModelInstalled: false,
    models: [],
    detail: "Axon models are unavailable.",
    installHint: "Restart Axon to start its local model runtime.",
  };
  const models = [...coreStatus.models, ...(opencode?.models ?? [])];
  const selectedInfo = models.find((model) => model.id === selectedModel);
  const detailParts = [coreStatus.detail, opencode?.detail].filter(Boolean);

  return {
    installed: coreStatus.installed || Boolean(opencode?.installed),
    running: coreStatus.running || Boolean(opencode?.running),
    startedByAxon: coreStatus.startedByAxon,
    providerLabel:
      selectedInfo?.backend === "opencode"
        ? "OpenCode"
        : coreStatus.providerLabel,
    selectedModel,
    selectedModelInstalled: selectedInfo?.available ?? false,
    models,
    memoryGB: coreStatus.memoryGB,
    detail: detailParts.join(" · ") || "No AI runtime available.",
    installHint: coreStatus.installHint || opencode?.installHint || "",
    openCodeInstalled: Boolean(opencode?.installed),
    openCodeRunning: Boolean(opencode?.running),
  };
}
