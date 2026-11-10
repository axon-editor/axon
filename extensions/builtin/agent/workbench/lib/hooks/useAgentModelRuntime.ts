/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type AiModelInfo,
  type AiPullEvent,
  type AiRuntimeStatus,
} from "@axon-editor/shared/ai/ai";
import { chooseModel } from "../helpers/agentWorkbenchHelpers";

export interface AgentModelRuntimeState {
  canChat: boolean;
  canManageModels: boolean;
  modelStatus: string;
  models: AiModelInfo[];
  pulling: boolean;
  pullEvent: AiPullEvent | null;
  pullPercent: number;
  runtimeLoading: boolean;
  runtimeStatus: AiRuntimeStatus | null;
  selectedModel: string;
  selectedModelInfo: AiModelInfo | undefined;
  selectedModelInstalled: boolean;
  selectedModelLabel: string;
  cancelPull: () => Promise<void>;
  pullSelectedModel: () => Promise<void>;
  reconnectOpenCode: () => Promise<void>;
  refreshModels: () => Promise<void>;
  refreshRuntimeStatus: (
    nextSelectedModel?: string,
    options?: { silent?: boolean },
  ) => Promise<void>;
  setSelectedModel: (model: string) => void;
}

// This hook is the renderer-side Agent model boundary. The sidebar should care
// about rendering model state, not about the request id bookkeeping needed to
// start, track, cancel, and refresh model downloads. Keeping that state in one
// place prevents stale pull events from an old download from mutating the
// currently selected model after the user has switched workspaces or models.
export function useAgentModelRuntime(
  folderPath: string | null,
): AgentModelRuntimeState {
  const [modelStatus, setModelStatus] = useState("Checking Axon models...");
  const [models, setModels] = useState<AiModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState("axon-code");
  const [runtimeStatus, setRuntimeStatus] = useState<AiRuntimeStatus | null>(
    null,
  );
  const [runtimeLoading, setRuntimeLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [pullEvent, setPullEvent] = useState<AiPullEvent | null>(null);
  const pullRef = useRef<{ requestId: string; model: string } | null>(null);

  // Tracking the selection in a ref instead of a dependency keeps the refresh
  // callback stable across model changes. Previously every selection rebuilt the
  // callback, which re-ran the refresh effect below: a full status fetch that
  // flipped runtimeLoading back to true and let chooseModel snap the selection
  // to the first installed model. That is what made the "needs download" panel
  // flash and then vanish the moment the user picked an uninstalled model.
  const selectedModelRef = useRef(selectedModel);
  const userSelectedModelRef = useRef(false);
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  const selectModel = useCallback((model: string) => {
    // A periodic refresh must not snap an explicitly chosen model to the first
    // available one. That would make a "needs download" selection jump away
    // every time the catalog is polled.
    userSelectedModelRef.current = true;
    selectedModelRef.current = model;
    setSelectedModel(model);
  }, []);

  const refreshRuntimeStatus = useCallback(
    async (
      nextSelectedModel?: string,
      options?: { silent?: boolean },
    ) => {
      const silent = options?.silent === true;
      const targetModel = nextSelectedModel ?? selectedModelRef.current;
      if (!silent) setRuntimeLoading(true);
      try {
        const status = await window.axon.getAiRuntimeStatus(folderPath);
        setRuntimeStatus(status);
        setModels(status.models);
        const requested = status.models.find(
          (model) => model.id === targetModel,
        );
        const nextModel =
          requested && userSelectedModelRef.current
            ? requested.id
            : chooseModel(status.models, targetModel);
        setSelectedModel(nextModel);
        setModelStatus(status.detail);
      } catch (err) {
        setRuntimeStatus({
          installed: false,
          running: false,
          startedByAxon: false,
          providerLabel: "Axon models",
          selectedModel: targetModel,
          selectedModelInstalled: false,
          models: [],
          detail:
            err instanceof Error
              ? err.message
              : "Axon models status could not be loaded.",
          installHint: "Restart Axon and try again.",
        });
        setModels([]);
        setModelStatus("Axon models not reachable");
      } finally {
        if (!silent) setRuntimeLoading(false);
      }
    },
    [folderPath],
  );

  const refreshModels = useCallback(
    () => refreshRuntimeStatus(undefined, { silent: true }),
    [refreshRuntimeStatus],
  );

  const reconnectOpenCode = useCallback(async () => {
    const restarted = await window.axon.reconnectOpenCode(folderPath);
    if (restarted) {
      await refreshRuntimeStatus(undefined, { silent: true });
    }
  }, [folderPath, refreshRuntimeStatus]);

  useEffect(() => {
    return window.axon.onAiRuntimeChanged(() => {
      void refreshModels();
    });
  }, [refreshModels]);

  useEffect(() => {
    return window.axon.onAiPullEvent((event) => {
      const pull = pullRef.current;
      if (!pull || pull.requestId !== event.requestId) return;

      setPullEvent(event);
      if (
        event.type === "done" ||
        event.type === "error" ||
        event.type === "cancelled"
      ) {
        setPulling(false);
        pullRef.current = null;
        void refreshRuntimeStatus(event.model);
      }
    });
  }, [refreshRuntimeStatus]);

  useEffect(() => {
    void refreshRuntimeStatus();
  }, [refreshRuntimeStatus]);

  // OpenCode can be installed, authenticated, or upgraded from Axon's terminal
  // while the sidebar stays mounted. A periodic silent refresh plus a focus
  // refresh makes those changes visible without a restart. Silent keeps the
  // runtime panel from flashing every poll.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void refreshModels();
    };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refreshModels]);

  const pullSelectedModel = useCallback(async () => {
    if (!selectedModel || pulling) return;

    setPulling(true);
    setPullEvent({
      requestId: "",
      type: "progress",
      model: selectedModel,
      status: "Starting model download...",
    });

    const started = await window.axon.pullAiModel(selectedModel);
    if (!started.success) {
      setPulling(false);
      setPullEvent({
        requestId: "",
        type: "error",
        model: selectedModel,
        error: started.message ?? "Model download could not start.",
      });
      return;
    }

    pullRef.current = {
      requestId: started.requestId,
      model: selectedModel,
    };
  }, [pulling, selectedModel]);

  const cancelPull = useCallback(async () => {
    const currentPull = pullRef.current;
    if (!currentPull) return;

    await window.axon.cancelAiModelPull(currentPull.requestId);
    setPulling(false);
    setPullEvent({
      requestId: currentPull.requestId,
      type: "cancelled",
      model: currentPull.model,
      error: "Model download cancelled.",
    });
    pullRef.current = null;
  }, []);

  const selectedModelInstalled =
    runtimeStatus?.models.some(
      (model) => model.id === selectedModel && model.available,
    ) ?? false;
  const selectedModelInfo = models.find((model) => model.id === selectedModel);
  const selectedModelLabel =
    selectedModelInfo?.label ??
    (selectedModel === "axon-code-fast"
      ? "Axon Code Fast"
      : selectedModel === "axon-code"
        ? "Axon Code"
        : "Axon model");
  const canChat =
    runtimeStatus?.installed === true &&
    runtimeStatus.running === true &&
    selectedModelInstalled &&
    !pulling;
  const canManageModels =
    runtimeStatus?.installed === true && runtimeStatus.running === true;
  const pullPercent =
    pullEvent?.total && pullEvent.total > 0
      ? Math.min(100, Math.round(((pullEvent.completed ?? 0) / pullEvent.total) * 100))
      : 0;

  return {
    canChat,
    canManageModels,
    modelStatus,
    models,
    pulling,
    pullEvent,
    pullPercent,
    runtimeLoading,
    runtimeStatus,
    selectedModel,
    selectedModelInfo,
    selectedModelInstalled,
    selectedModelLabel,
    cancelPull,
    pullSelectedModel,
    reconnectOpenCode,
    refreshModels,
    refreshRuntimeStatus,
    setSelectedModel: selectModel,
  };
}
