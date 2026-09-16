/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  useEffect,
  useRef,
  useState,
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
import AgentMessageList from "./chat/AgentMessageList";
import AgentRuntimeStatusPanel from "./AgentRuntimeStatusPanel";
import ClearConversationConfirmModal from "./ClearConversationConfirmModal";
import ContextChip from "./chat/ContextChip";
import SlashCommandMenu from "./chat/SlashCommandMenu";
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
  togglePinConversation,
} from "./lib/agentConversation";
import { resolveProposalPath } from "./lib/agentProposalPaths";
import {
  buildContextFile,
  collectGitDiffForAgent,
} from "./lib/agentWorkbenchHelpers";
import { useAgentChatStream } from "./lib/useAgentChatStream";
import { useAgentModelRuntime } from "./lib/useAgentModelRuntime";
import { useAgentSidebarResize } from "./lib/useAgentSidebarResize";

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
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [actionPickerOpen, setActionPickerOpen] = useState(false);
  const [conversationPickerOpen, setConversationPickerOpen] = useState(false);
  const [clearConversationId, setClearConversationId] = useState<string | null>(
    null,
  );
  const [slashCommandOpen, setSlashCommandOpen] = useState(false);
  const [contextEnabled, setContextEnabled] = useState({
    activeFile: true,
    diagnostics: true,
    gitChanges: true,
  });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const resumeRequestHandledRef = useRef<string | null>(null);
  const activeConversation = activeAgentConversation(conversationState);
  const {
    activeStreamId,
    beginStream,
    busy,
    cancelActiveStream,
    clearStream,
    setBusy,
  } = useAgentChatStream({ setMessages });
  const {
    canChat,
    canManageModels,
    cancelPull,
    modelStatus,
    models,
    pulling,
    pullEvent,
    pullPercent,
    pullSelectedModel,
    runtimeLoading,
    runtimeStatus,
    selectedModel,
    selectedModelInfo,
    selectedModelInstalled,
    selectedModelLabel,
    setSelectedModel,
  } = useAgentModelRuntime(props.folderPath);
  const {
    resize,
    startResize,
    stopResize,
  } = useAgentSidebarResize({
    side: props.side,
    width: props.width,
    onWidthChange: props.onWidthChange,
  });

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

    beginStream(started.requestId, assistantMessageId);
  };

  const startNewConversation = async () => {
    if (activeStreamId) {
      await cancelActiveStream();
    }
    clearStream();
    setConversationState((current) =>
      startAgentConversation(props.folderPath, current),
    );
    setMessages([]);
    setCopiedId(null);
    setConversationPickerOpen(false);
    setContextEnabled({ activeFile: true, diagnostics: true, gitChanges: true });
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
    clearStream();
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
    clearStream();
    setClearConversationId(null);
    setConversationPickerOpen(false);
  };

  const togglePin = (conversationId: string) => {
    setConversationState((current) =>
      togglePinConversation(props.folderPath, current, conversationId),
    );
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
        className="flex min-h-[56px] shrink-0 items-center justify-between gap-3 border-b bg-[var(--axon-panel-background)] px-4 py-2.5"
        style={{ borderColor: "var(--axon-panel-border)" }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-[var(--axon-editor-foreground)]">
              Ask Axon
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
            onTogglePin={togglePin}
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
        {!canChat && (
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
            onPullSelectedModel={() => void pullSelectedModel()}
          />
        )}
        {messages.length === 0 && canChat && (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--axon-syntax-function)]/15 text-[var(--axon-syntax-function)]">
              <MessageSquarePlus size={18} />
            </div>
            <div className="text-[13px] font-medium text-[var(--axon-editor-foreground)]">
              What can I help with?
            </div>
            <div className="mt-1.5 max-w-[240px] text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-45">
              Ask about your code, refactor functions, review changes, or explain
              how things work.
            </div>
          </div>
        )}
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

      {clearConversationId && (
        <ClearConversationConfirmModal
          onCancel={() => setClearConversationId(null)}
          onConfirm={() => void confirmClearConversation()}
        />
      )}

      {canChat && (
        <div className="shrink-0 border-t border-[var(--axon-panel-border)] bg-[var(--axon-sidebar-background)] p-3">
          <div className="relative rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] shadow-sm shadow-black/20">
            {(contextEnabled.activeFile && props.activeFilePath) ||
              (contextEnabled.diagnostics && props.diagnostics.length > 0) ||
              (contextEnabled.gitChanges && props.gitChanges.length > 0) ? (
              <div className="flex flex-wrap gap-1 border-b border-[var(--axon-panel-border)] px-3 py-2">
                {contextEnabled.activeFile && props.activeFilePath && (
                  <ContextChip
                    label={props.activeFilePath.split("/").pop() ?? props.activeFilePath}
                    onRemove={() => setContextEnabled((c) => ({ ...c, activeFile: false }))}
                  />
                )}
                {contextEnabled.diagnostics && props.diagnostics.length > 0 && (
                  <ContextChip
                    label={`${props.diagnostics.length} problems`}
                    onRemove={() => setContextEnabled((c) => ({ ...c, diagnostics: false }))}
                  />
                )}
                {contextEnabled.gitChanges && props.gitChanges.length > 0 && (
                  <ContextChip
                    label={`${props.gitChanges.length} changes`}
                    onRemove={() => setContextEnabled((c) => ({ ...c, gitChanges: false }))}
                  />
                )}
              </div>
            ) : null}

            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(event) => {
                const value = event.target.value;
                setPrompt(value);
                setSlashCommandOpen(value === "/");
                if (textareaRef.current) {
                  textareaRef.current.style.height = "auto";
                  textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !slashCommandOpen) {
                  event.preventDefault();
                  void runAgent();
                }
                if (event.key === "Escape" && slashCommandOpen) {
                  setSlashCommandOpen(false);
                }
              }}
              placeholder={slashCommandOpen ? "Choose a command..." : "Ask Axon..."}
              className="min-h-10 w-full resize-none bg-transparent px-3 py-2.5 text-[12px] leading-5 text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-35"
              rows={1}
            />

            {slashCommandOpen && (
              <SlashCommandMenu
                onSelect={(selectedAction) => {
                  setAction(selectedAction);
                  setPrompt("");
                  setSlashCommandOpen(false);
                  if (textareaRef.current) {
                    textareaRef.current.style.height = "auto";
                  }
                }}
              />
            )}

            <div className="flex items-center justify-between gap-2 border-t border-[var(--axon-panel-border)] px-2 py-1.5">
              <div className="flex min-w-0 items-center gap-1">
                {canManageModels && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setModelPickerOpen((open) => !open);
                        setActionPickerOpen(false);
                      }}
                      className="flex h-7 max-w-[130px] cursor-pointer items-center gap-1 rounded border border-[var(--axon-panel-border)] bg-transparent px-1.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-60 hover:border-[var(--axon-syntax-function)] hover:opacity-100"
                      aria-label="Choose Axon model"
                    >
                      <span className="truncate">{selectedModelLabel}</span>
                      <ChevronDown size={10} className="shrink-0 opacity-45" />
                    </button>
                    {modelPickerOpen && (
                      <div className="absolute bottom-8 left-0 z-30 w-[300px] overflow-hidden rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] shadow-2xl shadow-black/50">
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
                    )}
                  </div>
                )}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setActionPickerOpen((open) => !open);
                      setModelPickerOpen(false);
                    }}
                    className="flex h-7 max-w-[120px] cursor-pointer items-center gap-1 rounded border border-[var(--axon-panel-border)] bg-transparent px-1.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-60 hover:border-[var(--axon-syntax-function)] hover:opacity-100"
                    aria-label="Choose AI action"
                  >
                    <span className="truncate">{agentActionLabels[action]}</span>
                    <ChevronDown size={10} className="shrink-0 opacity-45" />
                  </button>
                  {actionPickerOpen && (
                    <div className="absolute bottom-8 left-0 z-30 w-[190px] overflow-hidden rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] p-1.5 shadow-2xl shadow-black/50">
                      {(["ask", ...agentQuickActions] as AiActionId[]).map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => {
                            setAction(item);
                            setActionPickerOpen(false);
                          }}
                          className={`flex h-7 w-full cursor-pointer items-center rounded px-2 text-left text-[11px] transition ${
                            action === item
                              ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                              : "text-[var(--axon-editor-foreground)] opacity-65 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
                          }`}
                        >
                          {agentActionLabels[item]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {busy && activeStreamId ? (
                <button
                  type="button"
                  onClick={() => void cancelActiveStream()}
                  className="flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-[#3a2630] bg-[#1a0f14] px-2.5 text-[11px] font-medium text-[#ff9ca8] transition hover:bg-[#24151b]"
                >
                  <StopCircle size={12} />
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void runAgent()}
                  disabled={!prompt.trim()}
                  className="flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md bg-[var(--axon-syntax-function)] px-2.5 text-[11px] font-medium text-white transition hover:opacity-90 disabled:opacity-30"
                >
                  <Send size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
