import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  ChevronDown,
  MessageSquarePlus,
  Send,
  StopCircle,
  X,
} from "lucide-react";
import {
  type AiActionId,
  type AiEditFileProposal,
  type AiModelInfo,
  type AiPullEvent,
  type AiRuntimeStatus,
} from "@axon-editor/shared/ai";
import { type EditorDiagnostic } from "@axon-editor/shared/diagnostics";
import { type GitChange } from "@axon-editor/shared/git";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";
import {
  agentActionLabels,
  agentQuickActions,
  defaultPromptForAction,
} from "./lib/agentActions";
import AgentConversationPicker from "./AgentConversationPicker";
import AgentMessageList from "./AgentMessageList";
import AgentRuntimeStatusPanel from "./AgentRuntimeStatusPanel";
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
} from "./lib/agentConversation";
import { resolveProposalPath } from "./lib/agentProposalPaths";
import {
  actionCanApplyEdits,
  buildContextFile,
  chooseModel,
  collectGitDiffForAgent,
  parseEditProposal,
  stripEditProposalJson,
  summarizeContext,
} from "./lib/agentWorkbenchHelpers";

interface Props {
  activeFileContent: string;
  activeFileLanguage: string;
  activeFilePath: string | null;
  diagnostics: EditorDiagnostic[];
  folderPath: string | null;
  gitChanges: GitChange[];
  initialAction: { action: AiActionId; nonce: number } | null;
  resumeConversationId: string | null;
  resumeRequested: boolean;
  side: "left" | "right";
  width: number;
  onApplyEdit: (path: string, content: string) => Promise<void>;
  onClose: () => void;
  onWidthChange: (width: number) => void;
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
  const resumeRequestHandledRef = useRef<string | null>(null);
  const contextSummary = useMemo(() => summarizeContext(props), [props]);
  const activeConversation = activeAgentConversation(conversationState);
  const resizeStateRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    const resumeConversationId = props.resumeConversationId;
    const resumeToken = props.resumeRequested
      ? resumeConversationId || "__list__"
      : null;

    if (!resumeToken) {
      resumeRequestHandledRef.current = null;
      return;
    }

    if (resumeRequestHandledRef.current === resumeToken) return;
    resumeRequestHandledRef.current = resumeToken;

    if (!resumeConversationId) {
      // A bare `axon resume` means reopen the workspace and surface the saved
      // conversation list first. That keeps the CLI flow conversation-based
      // without forcing the user into a brand-new thread when they meant to
      // continue something already in progress.
      setConversationPickerOpen(true);
      return;
    }

    if (conversationState.activeId === resumeConversationId) return;
    if (
      !conversationState.conversations.some(
        (conversation) => conversation.id === resumeConversationId,
      )
    ) {
      setConversationPickerOpen(true);
      return;
    }

    setConversationState((current) =>
      selectAgentConversation(props.folderPath, current, resumeConversationId),
    );
    setMessages(
      conversationState.conversations.find(
        (conversation) => conversation.id === resumeConversationId,
      )?.messages ?? [],
    );
    setConversationPickerOpen(false);
  }, [
    conversationState.activeId,
    conversationState.conversations,
    props.folderPath,
    props.resumeRequested,
    props.resumeConversationId,
  ]);

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

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStateRef.current = {
      startX: event.clientX,
      startWidth: props.width,
    };
  };

  const resize = (event: PointerEvent<HTMLDivElement>) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState) return;

    const delta =
      props.side === "right"
        ? resizeState.startX - event.clientX
        : event.clientX - resizeState.startX;
    const nextWidth = Math.min(
      720,
      Math.max(340, resizeState.startWidth + delta),
    );
    props.onWidthChange(nextWidth);
  };

  const stopResize = (event: PointerEvent<HTMLDivElement>) => {
    if (resizeStateRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeStateRef.current = null;
  };

  return (
    <aside
      className={`relative flex shrink-0 flex-col overflow-hidden bg-[var(--axon-sidebar-background)] ${
        props.side === "right" ? "border-l" : "border-r"
      }`}
      style={{
        borderColor: "var(--axon-panel-border)",
        width: props.width,
      }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Axon Agent sidebar"
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
        className={`absolute top-0 z-20 h-full w-1.5 cursor-col-resize transition-colors hover:bg-[var(--axon-syntax-function)]/35 ${
          props.side === "right" ? "left-0" : "right-0"
        }`}
      />
      <div
        className="flex min-h-[88px] shrink-0 items-center justify-between gap-3 border-b bg-[var(--axon-panel-background)] px-4 py-3"
        style={{ borderColor: "var(--axon-panel-border)" }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-[var(--axon-editor-foreground)]">
              Ask Axon
            </div>
            <div className="mt-1 truncate text-[11px] text-[var(--axon-editor-foreground)] opacity-55">
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
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-editor-foreground)]"
            >
              <MessageSquarePlus size={14} />
            </button>
          </Tooltip>
          <Tooltip label="Close Ask Axon" side="left">
            <button
              type="button"
              onClick={props.onClose}
              aria-label="Close Ask Axon"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-editor-foreground)]"
            >
              <X size={14} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!canChat ? (
          <AgentRuntimeStatusPanel
            diagnosticsCount={props.diagnostics.length}
            gitChangeCount={props.gitChanges.length}
            modelStatus={modelStatus}
            pulling={pulling}
            pullEvent={pullEvent}
            pullPercent={pullPercent}
            runtimeLoading={runtimeLoading}
            runtimeStatus={runtimeStatus}
            selectedModelInfo={selectedModelInfo}
            selectedModelInstalled={selectedModelInstalled}
            selectedModelLabel={selectedModelLabel}
            onCancelPull={() => void cancelPull()}
            onPullSelectedModel={() => void handlePullSelectedModel()}
          />
        ) : null}
        {messages.length === 0 && canChat ? (
          <div className="rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-4 shadow-sm shadow-black/20">
            <div className="text-[13px] font-semibold text-[var(--axon-editor-foreground)]">
              Ready for project-aware help
            </div>
            <div className="mt-2 text-[12px] leading-5 text-[var(--axon-editor-foreground)] opacity-60">
              Ask a question, inspect the active file, or choose an action when
              you want Axon to work with code context.
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--axon-editor-foreground)] opacity-45">
                  Model
                </div>
                <div className="mt-1 truncate text-[11px] text-[var(--axon-editor-foreground)]">
                  {selectedModelLabel}
                </div>
              </div>
              <div className="rounded border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--axon-editor-foreground)] opacity-45">
                  Problems
                </div>
                <div className="mt-1 text-[11px] text-[var(--axon-editor-foreground)]">
                  {props.diagnostics.length}
                </div>
              </div>
              <div className="rounded border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-2 py-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--axon-editor-foreground)] opacity-45">
                  Changes
                </div>
                <div className="mt-1 text-[11px] text-[var(--axon-editor-foreground)]">
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
        <div className="shrink-0 border-t border-[var(--axon-panel-border)] bg-[var(--axon-sidebar-background)] p-3">
          <div className="rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] shadow-sm shadow-black/20">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ask Axon about this project..."
              className="min-h-24 w-full resize-none bg-transparent px-3 py-3 text-[12px] leading-5 text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-35"
            />
            <div className="flex items-center justify-between gap-2 border-t border-[var(--axon-panel-border)] px-2 py-2">
              <div className="flex min-w-0 items-center gap-1.5">
                {canManageModels ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setModelPickerOpen((open) => !open);
                        setActionPickerOpen(false);
                      }}
                      className="flex h-8 max-w-[145px] cursor-pointer items-center gap-1.5 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-2 text-[11px] text-[var(--axon-editor-foreground)] hover:border-[var(--axon-syntax-function)] hover:bg-[var(--axon-panel-overlay-hover)]"
                      aria-label="Choose Axon model"
                    >
                      <span className="truncate">{selectedModelLabel}</span>
                      <ChevronDown size={12} className="shrink-0 text-[var(--axon-editor-foreground)] opacity-45" />
                    </button>
                    {modelPickerOpen ? (
                      <div className="absolute bottom-9 left-0 z-30 w-[300px] overflow-hidden rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] shadow-2xl shadow-black/50">
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
                                  ? "bg-[var(--axon-panel-overlay-hover)]"
                                  : "hover:bg-[var(--axon-panel-overlay-hover)]"
                              }`}
                            >
                              <span
                                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                  model.available
                                    ? "bg-[#5ee6a8]"
                                    : "bg-[var(--axon-editor-foreground)] opacity-35"
                                }`}
                              />
                              <span className="min-w-0">
                                <span className="block truncate text-[12px] text-[var(--axon-editor-foreground)]">
                                  {model.label}
                                </span>
                                <span className="mt-0.5 block text-[10px] leading-4 text-[var(--axon-editor-foreground)] opacity-60">
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
                    className="flex h-8 max-w-[135px] cursor-pointer items-center gap-1.5 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-2 text-[11px] text-[var(--axon-editor-foreground)] hover:border-[var(--axon-syntax-function)] hover:bg-[var(--axon-panel-overlay-hover)]"
                    aria-label="Choose AI action"
                  >
                    <span className="truncate">{agentActionLabels[action]}</span>
                    <ChevronDown size={12} className="shrink-0 text-[var(--axon-editor-foreground)] opacity-45" />
                  </button>
                  {actionPickerOpen ? (
                    <div className="absolute bottom-9 left-0 z-30 w-[190px] overflow-hidden rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] p-1.5 shadow-2xl shadow-black/50">
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
                              ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                              : "text-[var(--axon-editor-foreground)] opacity-65 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
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
                  className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--axon-syntax-function)] bg-[var(--axon-panel-overlay-hover)] px-3 text-[12px] font-medium text-[var(--axon-editor-foreground)] transition hover:bg-[var(--axon-panel-overlay-hover)]"
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
