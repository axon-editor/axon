import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  LoaderCircle,
  MessageSquarePlus,
  Send,
  Square,
  StopCircle,
  X,
} from "lucide-react";
import {
  type AiActionId,
  type AiChatResult,
  type AiContextFile,
  type AiEditFileProposal,
  type AiModelInfo,
  type AiPullEvent,
  type AiRuntimeStatus,
} from "../../../shared/ai";
import { type EditorDiagnostic } from "../../../shared/diagnostics";
import { type GitChange } from "../../../shared/git";
import Tooltip from "../../shared/components/Tooltip";
import {
  agentActionLabels,
  agentQuickActions,
  defaultPromptForAction,
} from "./agentActions";
import AgentConversationPicker from "./AgentConversationPicker";
import AgentMessageList from "./AgentMessageList";
import ClearConversationConfirmModal from "./ClearConversationConfirmModal";
import {
  type AgentMessage,
  activeAgentConversation,
  clearAgentConversation,
  conversationContext,
  isGreetingPrompt,
  loadAgentConversationState,
  saveActiveAgentConversation,
  selectAgentConversation,
  startAgentConversation,
} from "./agentConversation";
import { resolveProposalPath } from "./agentProposalPaths";

interface Props {
  activeFileContent: string;
  activeFileLanguage: string;
  activeFilePath: string | null;
  diagnostics: EditorDiagnostic[];
  folderPath: string | null;
  gitChanges: GitChange[];
  initialAction: { action: AiActionId; nonce: number } | null;
  onApplyEdit: (path: string, content: string) => Promise<void>;
  onClose: () => void;
}

function actionCanApplyEdits(action?: AiActionId) {
  return (
    action === "fix-problem" ||
    action === "refactor-selection" ||
    action === "generate-tests"
  );
}

function extractJsonObject(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseEditProposal(text: string) {
  const parsed = extractJsonObject(text);
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const proposal = (
    parsed as {
      editProposal?: AiChatResult["editProposal"];
    }
  ).editProposal;
  if (!proposal?.files?.length) return undefined;
  return proposal;
}

function stripEditProposalJson(text: string) {
  const fenceStart = text.search(/```(?:json)?\s*{\s*"editProposal"/i);
  if (fenceStart === -1) {
    const bareStart = text.search(/^\s*{\s*"editProposal"/im);
    if (bareStart === -1) return text.trim();
    const bareEnd = text.lastIndexOf("}");
    if (bareEnd === -1) return text.trim();
    return (text.slice(0, bareStart) + text.slice(bareEnd + 1)).trim();
  }

  const fenceEnd = text.indexOf("```", fenceStart + 3);
  if (fenceEnd === -1) return text.trim();
  return (text.slice(0, fenceStart) + text.slice(fenceEnd + 3)).trim();
}

function buildContextFile(input: Props): AiContextFile[] {
  if (!input.activeFilePath) return [];
  return [
    {
      path: input.activeFilePath,
      content: input.activeFileContent,
      languageId: input.activeFileLanguage,
      active: true,
    },
  ];
}

function summarizeContext(input: Props) {
  const parts = [
    input.activeFilePath ? "active file" : "no active file",
    `${input.diagnostics.length} problem${input.diagnostics.length === 1 ? "" : "s"}`,
    `${input.gitChanges.length} Git change${input.gitChanges.length === 1 ? "" : "s"}`,
  ];
  return parts.join(" / ");
}

function statusTone(ready: boolean, loading: boolean) {
  if (loading) return "border-[#334155] bg-[#101722] text-[#b8c7dd]";
  if (ready) return "border-[#1f5f4a] bg-[#0f221c] text-[#8ff0bf]";
  return "border-[#62412c] bg-[#20170f] text-[#ffbf87]";
}

function chooseModel(models: AiModelInfo[], requestedModel: string) {
  const requested = models.find((model) => model.id === requestedModel);
  if (requested?.available) return requested.id;
  const available = models.find((model) => model.available);
  if (available) return available.id;
  if (requested) return requested.id;
  return models[0]?.id ?? requestedModel;
}

async function collectGitDiffForAgent(folderPath: string, changes: GitChange[]) {
  const chunks: string[] = [];
  for (const change of changes.slice(0, 12)) {
    try {
      const result = await window.axon.getGitDiff(
        folderPath,
        change.absolutePath,
        change.staged,
        change.worktreeState === "untracked",
      );
      if (result.diff.trim()) {
        chunks.push(`diff -- ${change.path}\n${result.diff}`);
      }
    } catch (err) {
      chunks.push(
        `diff -- ${change.path}\n[failed to read diff: ${
          err instanceof Error ? err.message : "unknown error"
        }]`,
      );
    }
  }

  return chunks.join("\n\n");
}

export default function AxonAgentSidebar(props: Props) {
  const [conversationState, setConversationState] = useState(() =>
    loadAgentConversationState(props.folderPath),
  );
  const [messages, setMessages] = useState<AgentMessage[]>(() =>
    activeAgentConversation(loadAgentConversationState(props.folderPath)).messages,
  );
  const [prompt, setPrompt] = useState("");
  const [action, setAction] = useState<AiActionId>("ask");
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [modelStatus, setModelStatus] = useState("Checking Axon models...");
  const [models, setModels] = useState<AiModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState("axon-code");
  const [runtimeStatus, setRuntimeStatus] = useState<AiRuntimeStatus | null>(
    null,
  );
  const [runtimeLoading, setRuntimeLoading] = useState(true);
  const [pulling, setPulling] = useState(false);
  const [pullEvent, setPullEvent] = useState<AiPullEvent | null>(null);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [actionPickerOpen, setActionPickerOpen] = useState(false);
  const [conversationPickerOpen, setConversationPickerOpen] = useState(false);
  const [clearConversationId, setClearConversationId] = useState<string | null>(
    null,
  );
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const pullRef = useRef<{ requestId: string; model: string } | null>(null);
  const streamRef = useRef<{ requestId: string; messageId: number } | null>(
    null,
  );
  const contextSummary = useMemo(() => summarizeContext(props), [props]);
  const activeConversation = activeAgentConversation(conversationState);

  useEffect(() => {
    const nextState = loadAgentConversationState(props.folderPath);
    setConversationState(nextState);
    setMessages(activeAgentConversation(nextState).messages);
  }, [props.folderPath]);

  useEffect(() => {
    setConversationState((current) =>
      saveActiveAgentConversation(props.folderPath, current, messages),
    );
  }, [messages, props.folderPath]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({
      block: "end",
      behavior: busy ? "smooth" : "auto",
    });
  }, [busy, messages]);

  useEffect(() => {
    return window.axon.onAiChatStreamEvent((event) => {
      const stream = streamRef.current;
      if (!stream || event.requestId !== stream.requestId) return;

      if (event.type === "delta" && event.delta) {
        setMessages((current) =>
          current.map((message) =>
            message.id === stream.messageId
              ? { ...message, content: message.content + event.delta }
              : message,
          ),
        );
        return;
      }

      if (event.type === "status") {
        return;
      }

      if (event.type === "error") {
        setMessages((current) =>
          current.map((message) =>
            message.id === stream.messageId
              ? {
                  ...message,
                  content:
                    message.content ||
                    event.error ||
                    "Axon Agent stream failed.",
                }
              : message,
          ),
        );
        streamRef.current = null;
        setActiveStreamId(null);
        setBusy(false);
        return;
      }

      if (event.type === "cancelled") {
        setMessages((current) =>
          current.map((message) =>
            message.id === stream.messageId
              ? {
                  ...message,
                  content:
                    message.content.trim() ||
                    "Request cancelled before Axon returned content.",
                }
              : message,
          ),
        );
        streamRef.current = null;
        setActiveStreamId(null);
        setBusy(false);
        return;
      }

      if (event.type === "done") {
        setMessages((current) =>
          current.map((message) => {
            if (message.id !== stream.messageId) return message;
            const editProposal = parseEditProposal(message.content);
            const canApplyEdits = actionCanApplyEdits(message.action);
            const strippedContent = stripEditProposalJson(message.content);
            return {
              ...message,
              content: canApplyEdits
                ? strippedContent || message.content
                : strippedContent ||
                  "I should not propose file edits for this action. Ask a project question or choose an edit action when you want code changes.",
              result: editProposal && canApplyEdits
                ? {
                    success: true,
                    message: message.content,
                    modelLabel: "Axon model",
                    providerLabel: "Axon models",
                    editProposal,
                  }
                : message.result,
            };
          }),
        );
        streamRef.current = null;
        setActiveStreamId(null);
        setBusy(false);
      }
    });
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshRuntimeStatus = async (nextSelectedModel = selectedModel) => {
    setRuntimeLoading(true);
    try {
      const status = await window.axon.getAiRuntimeStatus(props.folderPath);
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
  };

  useEffect(() => {
    void refreshRuntimeStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.folderPath]);

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

  const runAgent = async (nextAction = action, nextPrompt = prompt) => {
    const finalPrompt = nextPrompt.trim() || defaultPromptForAction(nextAction);
    if (!finalPrompt || busy || !canChat) return;

    const userMessage: AgentMessage = {
      id: Date.now(),
      role: "user",
      content: finalPrompt,
    };
    setMessages((current) => [...current, userMessage]);
    setPrompt("");
    setBusy(true);

    if (messages.length === 0 && nextAction === "ask" && isGreetingPrompt(finalPrompt)) {
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: "What are we working on in Axon today?",
          action: nextAction,
        },
      ]);
      setBusy(false);
      return;
    }

    const assistantMessageId = Date.now() + 1;
    setMessages((current) => [
      ...current,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        action: nextAction,
      },
    ]);

    const gitDiff =
      props.folderPath &&
      (nextAction === "review-git-diff" ||
        nextAction === "draft-commit-message")
        ? await collectGitDiffForAgent(props.folderPath, props.gitChanges)
        : undefined;

    const started = await window.axon.runAiChatStream({
      action: nextAction,
      prompt: finalPrompt,
      folderPath: props.folderPath,
      activeFilePath: props.activeFilePath,
      files: buildContextFile(props),
      diagnostics: props.diagnostics,
      gitChanges: props.gitChanges,
      conversation: conversationContext(messages),
      gitDiff,
      model: selectedModel,
    });

    if (!started.success) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content: started.message ?? "Axon Agent could not start.",
              }
            : message,
        ),
      );
      setBusy(false);
      return;
    }

    streamRef.current = {
      requestId: started.requestId,
      messageId: assistantMessageId,
    };
    setActiveStreamId(started.requestId);
  };

  const cancelActiveStream = async () => {
    const stream = streamRef.current;
    if (!stream) return;
    await window.axon.cancelAiChatStream(stream.requestId);
  };

  const startNewConversation = async () => {
    if (activeStreamId) {
      await cancelActiveStream();
    }
    streamRef.current = null;
    setActiveStreamId(null);
    setBusy(false);
    setConversationState((current) =>
      startAgentConversation(props.folderPath, current),
    );
    setMessages([]);
    setCopiedId(null);
    setConversationPickerOpen(false);
  };

  const switchConversation = async (conversationId: string) => {
    if (activeStreamId) {
      await cancelActiveStream();
    }
    setConversationState((current) => {
      const nextState = selectAgentConversation(
        props.folderPath,
        current,
        conversationId,
      );
      setMessages(activeAgentConversation(nextState).messages);
      return nextState;
    });
    streamRef.current = null;
    setActiveStreamId(null);
    setBusy(false);
    setConversationPickerOpen(false);
  };

  const confirmClearConversation = async () => {
    if (!clearConversationId) return;
    if (activeStreamId) {
      await cancelActiveStream();
    }
    setConversationState((current) => {
      const nextState = clearAgentConversation(
        props.folderPath,
        current,
        clearConversationId,
      );
      setMessages(activeAgentConversation(nextState).messages);
      return nextState;
    });
    streamRef.current = null;
    setActiveStreamId(null);
    setBusy(false);
    setClearConversationId(null);
    setConversationPickerOpen(false);
  };

  useEffect(() => {
    if (!props.initialAction) return;
    const nextAction = props.initialAction.action;
    setAction(nextAction);
    void runAgent(nextAction, defaultPromptForAction(nextAction));
    // initialAction.nonce is the trigger; the rest of the dependencies are read
    // from current props/state when the command opens the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialAction?.nonce]);

  const applyEdit = async (file: AiEditFileProposal) => {
    const resolvedPath = props.folderPath
      ? resolveProposalPath(file.path, props.folderPath)
      : file.path;
    if (!resolvedPath) {
      setMessages((current) => [
        ...current,
        {
          id: Date.now(),
          role: "assistant",
          content: `Skipped unsafe edit proposal path outside the workspace: ${file.path}`,
        },
      ]);
      return;
    }
    await props.onApplyEdit(resolvedPath, file.newContent);
    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        role: "assistant",
        content: `Applied ${resolvedPath}`,
      },
    ]);
  };

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

  const handlePullSelectedModel = async () => {
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
  };

  const cancelPull = async () => {
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
  };

  return (
    <aside
      className="relative flex w-[460px] shrink-0 flex-col overflow-hidden border-l bg-[#070a0f]"
      style={{ borderColor: "var(--axon-panel-border)" }}
    >
      <div
        className="flex min-h-[88px] shrink-0 items-center justify-between gap-3 border-b bg-[#0b0f17] px-4 py-3"
        style={{ borderColor: "var(--axon-panel-border)" }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-[#edf3ff]">
              Ask Axon
            </div>
            <div className="mt-1 truncate text-[11px] text-[#77849a]">
              {contextSummary}
            </div>
          </div>
        </div>
        <div className="relative flex shrink-0 items-center gap-2">
          <AgentConversationPicker
            activeTitle={activeConversation.title}
            conversationState={conversationState}
            open={conversationPickerOpen}
            onOpenChange={setConversationPickerOpen}
            onRequestClear={setClearConversationId}
            onSelect={(conversationId) => void switchConversation(conversationId)}
          />
          <Tooltip label="Start new Ask Axon conversation" side="left">
            <button
              type="button"
              onClick={() => void startNewConversation()}
              aria-label="Start new Ask Axon conversation"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[#151923] hover:text-white"
            >
              <MessageSquarePlus size={14} />
            </button>
          </Tooltip>
          <Tooltip label="Close Ask Axon" side="left">
            <button
              type="button"
              onClick={props.onClose}
              aria-label="Close Ask Axon"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[#151923] hover:text-white"
            >
              <X size={14} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!canChat ? (
          <div className="mb-4 overflow-hidden rounded-md border border-[#243047] bg-[#0d121b] shadow-sm shadow-black/20">
            <div className="border-b border-[#1d2432] bg-[#101722] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[#edf3ff]">
                    {runtimeLoading
                      ? "Checking Axon models"
                      : runtimeStatus?.installed === false
                        ? "Axon models engine missing"
                        : runtimeStatus?.running === false
                          ? "Axon models engine is not running"
                          : selectedModelInstalled
                            ? `${selectedModelLabel} is ready`
                            : `${selectedModelLabel} needs download`}
                  </div>
                  <div className="mt-1 text-[11px] leading-5 text-[#8d98aa]">
                    {runtimeStatus?.detail ?? modelStatus}
                  </div>
                </div>
                <div
                  className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-medium ${statusTone(
                    selectedModelInstalled,
                    runtimeLoading,
                  )}`}
                >
                  {runtimeLoading
                    ? "Checking"
                    : selectedModelInstalled
                      ? "Ready"
                      : "Action needed"}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-px bg-[#1d2432]">
              <div className="bg-[#0b1018] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-[#647086]">
                  Model
                </div>
                <div className="mt-1 truncate text-[11px] text-[#dce4f0]">
                  {selectedModelLabel}
                </div>
              </div>
              <div className="bg-[#0b1018] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-[#647086]">
                  Problems
                </div>
                <div className="mt-1 text-[11px] text-[#dce4f0]">
                  {props.diagnostics.length}
                </div>
              </div>
              <div className="bg-[#0b1018] px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-[#647086]">
                  Changes
                </div>
                <div className="mt-1 text-[11px] text-[#dce4f0]">
                  {props.gitChanges.length}
                </div>
              </div>
            </div>
            {runtimeStatus?.installHint ? (
              <div className="border-t border-[#1d2432] bg-[#091018] px-4 py-3 text-[11px] leading-5 text-[#c8d0e0]">
                {runtimeStatus.installHint}
              </div>
            ) : null}
            {runtimeStatus?.installed && runtimeStatus.running && !selectedModelInstalled ? (
              <div className="border-t border-[#1d2432] p-4">
                <div className="mb-3 rounded border border-[#20283a] bg-[#090d13] p-3">
                  <div className="text-[12px] font-semibold text-[#edf3ff]">
                    {selectedModelLabel}
                  </div>
                  {selectedModelInfo?.description ? (
                    <div className="mt-1 text-[11px] leading-5 text-[#8d98aa]">
                      {selectedModelInfo.description}
                    </div>
                  ) : null}
                </div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate text-[11px] text-[#9aa4b8]">
                    Download {selectedModelLabel} to enable chat.
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {pulling ? (
                      <button
                        type="button"
                        onClick={() => void cancelPull()}
                        className="flex h-8 cursor-pointer items-center gap-1.5 rounded border border-[#3a2630] bg-[#1a0f14] px-2.5 text-[12px] font-medium text-[#ff9ca8] hover:bg-[#24151b]"
                      >
                        <Square size={11} />
                        Cancel
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handlePullSelectedModel()}
                      disabled={pulling}
                      className="flex h-8 cursor-pointer items-center gap-1.5 rounded bg-[#1f5262] px-3 text-[12px] font-medium text-white hover:bg-[#28687c] disabled:cursor-default disabled:opacity-50"
                    >
                      {pulling ? (
                        <LoaderCircle size={13} className="animate-spin" />
                      ) : (
                        <Download size={13} />
                      )}
                      {pulling ? "Downloading" : "Download"}
                    </button>
                  </div>
                </div>
                {pullEvent ? (
                  <div className="rounded border border-[#222838] bg-[#080b10] p-2">
                    <div className="flex items-center justify-between text-[10px] text-[#647086]">
                      <span className="truncate">
                        {pullEvent.error ?? pullEvent.status ?? "Preparing..."}
                      </span>
                      <span>{pullPercent > 0 ? `${pullPercent}%` : ""}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded bg-[#151b27]">
                      <div
                        className="h-full bg-[#80c8e0] transition-all"
                        style={{ width: `${pullPercent > 0 ? pullPercent : 12}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {messages.length === 0 && canChat ? (
          <div className="rounded-md border border-[#243047] bg-[#0d121b] p-4 shadow-sm shadow-black/20">
            <div className="text-[13px] font-semibold text-[#edf3ff]">
              Ready for project-aware help
            </div>
            <div className="mt-2 text-[12px] leading-5 text-[#8d98aa]">
              Ask a question, inspect the active file, or choose an action when
              you want Axon to work with code context.
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded border border-[#20283a] bg-[#090d13] px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-[#647086]">
                  Model
                </div>
                <div className="mt-1 truncate text-[11px] text-[#dce4f0]">
                  {selectedModelLabel}
                </div>
              </div>
              <div className="rounded border border-[#20283a] bg-[#090d13] px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-[#647086]">
                  Problems
                </div>
                <div className="mt-1 text-[11px] text-[#dce4f0]">
                  {props.diagnostics.length}
                </div>
              </div>
              <div className="rounded border border-[#20283a] bg-[#090d13] px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-[#647086]">
                  Changes
                </div>
                <div className="mt-1 text-[11px] text-[#dce4f0]">
                  {props.gitChanges.length}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <AgentMessageList
          copiedId={copiedId}
          messages={messages}
          onApplyEdit={(file) => void applyEdit(file)}
          onCopied={(messageId) => {
            setCopiedId(messageId);
            window.setTimeout(() => setCopiedId(null), 1200);
          }}
          scrollAnchorRef={scrollAnchorRef}
        />
      </div>

      {clearConversationId ? (
        <ClearConversationConfirmModal
          onCancel={() => setClearConversationId(null)}
          onConfirm={() => void confirmClearConversation()}
        />
      ) : null}

      {canChat ? (
        <div className="shrink-0 border-t border-[#1d2432] bg-[#080c12] p-3">
          <div className="rounded-md border border-[#263047] bg-[#0b1018] shadow-sm shadow-black/20">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ask Axon about this project..."
              className="min-h-24 w-full resize-none bg-transparent px-3 py-3 text-[12px] leading-5 text-[#dce4f0] outline-none placeholder:text-[#465166]"
            />
            <div className="flex items-center justify-between gap-2 border-t border-[#1d2432] px-2 py-2">
              <div className="flex min-w-0 items-center gap-1.5">
                {canManageModels ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setModelPickerOpen((open) => !open);
                        setActionPickerOpen(false);
                      }}
                      className="flex h-8 max-w-[145px] cursor-pointer items-center gap-1.5 rounded border border-[#243047] bg-[#0d121b] px-2 text-[11px] text-[#c8d0e0] hover:border-[#34516a] hover:bg-[#111925]"
                      aria-label="Choose Axon model"
                    >
                      <span className="truncate">{selectedModelLabel}</span>
                      <ChevronDown size={12} className="shrink-0 text-[#647086]" />
                    </button>
                    {modelPickerOpen ? (
                      <div className="absolute bottom-9 left-0 z-30 w-[300px] overflow-hidden rounded-md border border-[#263047] bg-[#090d13] shadow-2xl shadow-black/50">
                        <div className="max-h-[260px] overflow-y-auto p-1.5">
                          {models.map((model) => (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => {
                                setSelectedModel(model.id);
                                setModelPickerOpen(false);
                              }}
                              className={`flex w-full cursor-pointer items-start gap-2 rounded px-2 py-2 text-left transition ${
                                model.id === selectedModel
                                  ? "bg-[#142633]"
                                  : "hover:bg-[#111925]"
                              }`}
                            >
                              <span
                                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                  model.available ? "bg-[#5ee6a8]" : "bg-[#7c879b]"
                                }`}
                              />
                              <span className="min-w-0">
                                <span className="block truncate text-[12px] text-[#dce4f0]">
                                  {model.label}
                                </span>
                                <span className="mt-0.5 block text-[10px] leading-4 text-[#8d98aa]">
                                  {model.available ? "Ready" : "Download required"}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setActionPickerOpen((open) => !open);
                      setModelPickerOpen(false);
                    }}
                    className="flex h-8 max-w-[135px] cursor-pointer items-center gap-1.5 rounded border border-[#243047] bg-[#0d121b] px-2 text-[11px] text-[#c8d0e0] hover:border-[#34516a] hover:bg-[#111925]"
                    aria-label="Choose AI action"
                  >
                    <span className="truncate">{agentActionLabels[action]}</span>
                    <ChevronDown size={12} className="shrink-0 text-[#647086]" />
                  </button>
                  {actionPickerOpen ? (
                    <div className="absolute bottom-9 left-0 z-30 w-[190px] overflow-hidden rounded-md border border-[#263047] bg-[#090d13] p-1.5 shadow-2xl shadow-black/50">
                      {(["ask", ...agentQuickActions] as AiActionId[]).map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => {
                            setAction(item);
                            setActionPickerOpen(false);
                          }}
                          className={`flex h-8 w-full cursor-pointer items-center rounded px-2 text-left text-[11px] transition ${
                            action === item
                              ? "bg-[#142633] text-[#dff7ff]"
                              : "text-[#9aa4b8] hover:bg-[#111925] hover:text-white"
                          }`}
                        >
                          {agentActionLabels[item]}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              {busy && activeStreamId ? (
                <button
                  type="button"
                  onClick={() => void cancelActiveStream()}
                  className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-[#3a2630] bg-[#1a0f14] px-3 text-[12px] font-medium text-[#ff9ca8] transition hover:bg-[#24151b]"
                >
                  <StopCircle size={13} />
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void runAgent()}
                  className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-[#1f5262] px-3 text-[12px] font-medium text-white transition hover:bg-[#28687c]"
                >
                  <Send size={13} />
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
