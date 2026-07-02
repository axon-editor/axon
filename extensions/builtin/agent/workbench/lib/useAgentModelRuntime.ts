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
} from "@axon-editor/shared/ai";
import { chooseModel } from "./agentWorkbenchHelpers";

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
  refreshRuntimeStatus: (nextSelectedModel?: string) => Promise<void>;
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

  const refreshRuntimeStatus = useCallback(
    async (nextSelectedModel = selectedModel) => {
      setRuntimeLoading(true);
      try {
        const status = await window.axon.getAiRuntimeStatus(folderPath);
        setRuntimeStatus(status);
        setModels(status.models);
        const nextModel = chooseModel(status.models, nextSelectedModel);
        setSelectedModel(nextModel);
        setModelStatus(status.detail);
      } catch (err) {
        setRuntimeStatus({
          installed: false,
          running: false,
          startedByAxon: false,
          providerLabel: "Axon models",
          selectedModel: nextSelectedModel,
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
        setRuntimeLoading(false);
      }
    },
    [folderPath, selectedModel],
  );

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

  useEffect(() => {
    if (!runtimeStatus?.models.length) return;
    setRuntimeStatus((current) =>
      current
        ? {
            ...current,
            selectedModel,
            selectedModelInstalled: current.models.some(
              (model) => model.id === selectedModel && model.available,
            ),
          }
        : current,
    );
  }, [runtimeStatus?.models, selectedModel]);

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
    refreshRuntimeStatus,
    setSelectedModel,
  };
}
