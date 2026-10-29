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
  ArrowDown,
  ChevronDown,
  MessageSquarePlus,
  Send,
  StopCircle,
  X,
} from "lucide-react";
import {
  type AiActionId,
  type AiEditFileProposal,
  type AiUiState,
} from "@axon-editor/shared/ai/ai";
import { type EditorDiagnostic } from "@axon-editor/shared/editor/language/diagnostics";
import { type GitChange } from "@axon-editor/shared/workspace/git";
import Tooltip from "@axon-editor/renderer/shared/components/primitives/Tooltip";
import AxonIcon from "../components/AxonIcon";
import {
  agentActionLabels,
  agentQuickActions,
  defaultPromptForAction,
} from "../lib/actions/agentActions";
import AgentConversationPicker from "./AgentConversationPicker";
import AgentMessageList from "../chat/messages/AgentMessageList";
import AgentModelPicker from "./AgentModelPicker";
import AgentRuntimeStatusPanel from "./AgentRuntimeStatusPanel";
import ClearConversationConfirmModal from "../modals/ClearConversationConfirmModal";
import ContextChip from "../chat/composer/ContextChip";
import SlashCommandMenu from "../chat/composer/SlashCommandMenu";
import {
  type AgentMessage,
  type AgentToolCallState,
  activeAgentConversation,
  clearAgentConversation,
  conversationAction,
  emptyAgentConversationState,
  flushAllAgentConversations,
  isGreetingPrompt,
  loadAgentConversationState,
  saveActiveAgentConversation,
  selectAgentConversation,
  selectConversationAction,
  startAgentConversation,
  togglePinConversation,
} from "../lib/conversation";
import { type AgentToolRunResult } from "../lib/actions/agentToolActions";
import { conversationContext } from "../lib/conversation/context";
import { updateAgentTool } from "../lib/conversation/timeline";
import { resolveProposalPath } from "../lib/conversation/agentProposalPaths";
import { resolveAgentMessageLink } from "../lib/links/agentMessageLinks";
import {
  buildContextFile,
  collectGitDiffForAgent,
} from "../lib/helpers/agentWorkbenchHelpers";
import { useAgentChatStream } from "../lib/hooks/useAgentChatStream";
import { useAgentModelRuntime } from "../lib/hooks/useAgentModelRuntime";
import { useAgentSidebarResize } from "../lib/hooks/useAgentSidebarResize";
import { usePopoverDismiss } from "../lib/hooks/usePopoverDismiss";
import { useStickyScroll } from "../lib/hooks/useStickyScroll";
import "../styles/agentPopups.css";

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
  uiState: AiUiState;
  onAgentDirectoryCreated: (path: string) => void;
  onAgentFileWritten: (path: string) => void;
  onApplyEdit: (path: string, content: string) => Promise<void>;
  onClose: () => void;
  onOpenFile: (path: string) => void;
  onRunAgentAction: (
    name: string,
    args: Record<string, unknown>,
  ) => AgentToolRunResult | Promise<AgentToolRunResult>;
  onWidthChange: (width: number) => void;
}

export default function AxonAgentSidebar(props: Props) {
  const [conversationState, setConversationState] = useState(
    emptyAgentConversationState,
  );
  const [messages, setMessages] = useState<AgentMessage[]>(
    () => activeAgentConversation(conversationState).messages,
  );
  const [loadedFolderPath, setLoadedFolderPath] = useState<
    string | null | undefined
  >(undefined);
  // A folder prop can change a render before the load effect runs. Comparing
  // the loaded folder keeps the previous workspace's state from being saved or
  // cleared into the new workspace during that gap.
  const conversationReady =
    loadedFolderPath !== undefined && loadedFolderPath === props.folderPath;
  const [prompt, setPrompt] = useState("");
  const [action, setAction] = useState<AiActionId>("agent");
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
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const resumeRequestHandledRef = useRef<string | null>(null);
  const conversationStateRef = useRef(conversationState);
  const actionPickerRef = useRef<HTMLDivElement | null>(null);
  const activeConversation = activeAgentConversation(conversationState);
  const activeConversationEmpty = activeConversation.messages.length === 0;
  const {
    activeStreamId,
    beginStream,
    busy,
    cancelActiveStream,
    clearStream,
    setBusy,
  } = useAgentChatStream({
    setMessages,
    onDirectoryCreated: props.onAgentDirectoryCreated,
    onFileWritten: props.onAgentFileWritten,
  });
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
  const { pinToBottom, pinned } = useStickyScroll({
    scrollRef: messageScrollRef,
    contentVersion: messages,
    resetKey: conversationState.activeId,
  });

  usePopoverDismiss(actionPickerRef, actionPickerOpen, () =>
    setActionPickerOpen(false),
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [prompt]);

  useEffect(() => {
    if (!conversationReady) return;
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

    setConversationState((current) => {
      const nextState = selectAgentConversation(
        props.folderPath,
        current,
        resumeConversationId,
      );
      const active = activeAgentConversation(nextState);
      setMessages(active.messages);
      setAction(conversationAction(active));
      return nextState;
    });
    setConversationPickerOpen(false);
  }, [
    conversationReady,
    conversationState.activeId,
    conversationState.conversations,
    props.folderPath,
    props.resumeRequested,
    props.resumeConversationId,
  ]);

  useEffect(() => {
    let cancelled = false;
    setLoadedFolderPath(undefined);
    resumeRequestHandledRef.current = null;
    setConversationPickerOpen(false);
    setActionPickerOpen(false);
    setSlashCommandOpen(false);
    setClearConversationId(null);

    const pending = emptyAgentConversationState();
    const pendingActive = activeAgentConversation(pending);
    setConversationState(pending);
    setMessages(pendingActive.messages);
    setAction(conversationAction(pendingActive));

    void loadAgentConversationState(props.folderPath)
      .then((nextState) => {
        if (cancelled) return;
        const active = activeAgentConversation(nextState);
        setConversationState(nextState);
        setMessages(active.messages);
        setAction(conversationAction(active));
        setLoadedFolderPath(props.folderPath);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("failed to load agent conversations:", error);
        const fallback = emptyAgentConversationState();
        const active = activeAgentConversation(fallback);
        setConversationState(fallback);
        setMessages(active.messages);
        setAction(conversationAction(active));
        setLoadedFolderPath(props.folderPath);
      });

    return () => {
      cancelled = true;
    };
  }, [props.folderPath]);

  useEffect(() => {
    conversationStateRef.current = conversationState;
  }, [conversationState]);

  useEffect(() => {
    if (!conversationReady) return;
    const current = conversationStateRef.current;
    const active = activeAgentConversation(current);
    if (active.messages === messages) return;
    setConversationState(
      saveActiveAgentConversation(props.folderPath, current, messages),
    );
  }, [messages, props.folderPath, conversationReady]);

  useEffect(() => {
    const flush = () => flushAllAgentConversations();
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      // Streaming updates are debounced, so closing the panel has to push the
      // last pending conversation instead of waiting for the next token.
      flush();
    };
  }, []);

  const runAgent = async (nextAction = action, nextPrompt = prompt) => {
    const finalPrompt = nextPrompt.trim() || defaultPromptForAction(nextAction);
    if (!finalPrompt || busy || !canChat || !conversationReady) return;

    setAction(nextAction);
    setConversationState((current) =>
      selectConversationAction(props.folderPath, current, nextAction),
    );

    const userMessage: AgentMessage = {
      id: Date.now(),
      role: "user",
      content: finalPrompt,
    };
    setMessages((current) => [...current, userMessage]);
    setPrompt("");
    setBusy(true);
    // Sending is an explicit request for the latest message, even if the user
    // had scrolled up to re-read something before composing.
    pinToBottom();

    if (
      messages.length === 0 &&
      (nextAction === "agent" || nextAction === "ask") &&
      isGreetingPrompt(finalPrompt)
    ) {
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
      uiState: props.uiState,
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

  const selectAction = (nextAction: AiActionId) => {
    if (!conversationReady) return;
    setAction(nextAction);
    setConversationState((current) =>
      selectConversationAction(props.folderPath, current, nextAction),
    );
  };

  const startNewConversation = async () => {
    if (!conversationReady || activeConversationEmpty) return;
    if (activeStreamId) {
      await cancelActiveStream();
    }
    clearStream();
    setConversationState((current) => {
      const nextState = startAgentConversation(props.folderPath, current);
      const active = activeAgentConversation(nextState);
      setMessages(active.messages);
      setAction(conversationAction(active));
      return nextState;
    });
    setCopiedId(null);
    setConversationPickerOpen(false);
    setContextEnabled({ activeFile: true, diagnostics: true, gitChanges: true });
  };

  const switchConversation = async (conversationId: string) => {
    if (!conversationReady) return;
    if (activeStreamId) {
      await cancelActiveStream();
    }
    setConversationState((current) => {
      const nextState = selectAgentConversation(
        props.folderPath,
        current,
        conversationId,
      );
      const active = activeAgentConversation(nextState);
      setMessages(active.messages);
      setAction(conversationAction(active));
      return nextState;
    });
    clearStream();
    setConversationPickerOpen(false);
  };

  const confirmClearConversation = async () => {
    if (!conversationReady || !clearConversationId) return;
    if (activeStreamId) {
      await cancelActiveStream();
    }
    setConversationState((current) => {
      const nextState = clearAgentConversation(
        props.folderPath,
        current,
        clearConversationId,
      );
      const active = activeAgentConversation(nextState);
      setMessages(active.messages);
      setAction(conversationAction(active));
      return nextState;
    });
    clearStream();
    setClearConversationId(null);
    setConversationPickerOpen(false);
  };

  const togglePin = (conversationId: string) => {
    if (!conversationReady) return;
    setConversationState((current) =>
      togglePinConversation(props.folderPath, current, conversationId),
    );
  };

  useEffect(() => {
    if (!conversationReady || !props.initialAction) return;
    const nextAction = props.initialAction.action;
    setAction(nextAction);
    void runAgent(nextAction, defaultPromptForAction(nextAction));
    // initialAction.nonce is the trigger; the rest of the dependencies are read
    // from current props/state when the command opens the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationReady, props.initialAction?.nonce]);

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

  const openMessageLink = (href: string) => {
    const target = resolveAgentMessageLink(href, props.folderPath);
    if (!target) return;
    if (target.kind === "external") {
      void window.axon?.openExternalLink(target.href);
      return;
    }
    if (target.kind === "file") {
      props.onOpenFile(target.path);
    }
  };

  const setToolStatus = (
    messageId: number,
    toolId: string,
    status: AgentToolCallState["status"],
    message?: string,
  ) => {
    setMessages((current) =>
      current.map((item) =>
        item.id === messageId
          ? updateAgentTool(item, toolId, {
              status,
              ...(message !== undefined ? { message } : {}),
            })
          : item,
      ),
    );
  };

  const runTool = async (
    messageId: number,
    tool: AgentToolCallState,
    allowForSession = false,
  ) => {
    setToolStatus(messageId, tool.id, "running");
    const result = await props.onRunAgentAction(tool.name, tool.arguments);
    await window.axon.reportAiUiToolResult({
      callId: tool.id,
      ok: result.ok,
      message: result.message,
      ...(allowForSession ? { allowForSession: true } : {}),
    });
  };

  const allowTool = (messageId: number, tool: AgentToolCallState) =>
    runTool(messageId, tool, true);

  const skipTool = async (messageId: number, tool: AgentToolCallState) => {
    setToolStatus(messageId, tool.id, "rejected");
    await window.axon.reportAiUiToolResult({
      callId: tool.id,
      ok: false,
      rejected: true,
      message: "Skipped by user.",
    });
  };

  const insertNewline = (textarea: HTMLTextAreaElement) => {
    textarea.setRangeText(
      "\n",
      textarea.selectionStart,
      textarea.selectionEnd,
      "end",
    );
    setPrompt(textarea.value);
    setSlashCommandOpen(false);
  };

  return (
    <aside
      className={`axon-region-surface relative flex shrink-0 flex-col overflow-hidden bg-[var(--axon-sidebar-background)] ${
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
        className={`absolute top-0 z-20 h-full w-1 cursor-col-resize transition-colors hover:bg-[var(--axon-syntax-function)]/25 ${
          props.side === "right" ? "left-0" : "right-0"
        }`}
      />
      <div className="flex min-h-[48px] shrink-0 items-center justify-between border-b border-[var(--axon-panel-border)] bg-transparent px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <AxonIcon size={18} className="shrink-0" />
          <span className="truncate text-[12px] font-medium text-[var(--axon-editor-foreground)]">
            Axon Agent
          </span>
        </div>
        <div className="relative flex shrink-0 items-center gap-0.5">
          <AgentConversationPicker
            activeTitle={activeConversation.title}
            conversationState={conversationState}
            disabled={!conversationReady}
            open={conversationPickerOpen}
            onOpenChange={setConversationPickerOpen}
            onRequestClear={setClearConversationId}
            onSelect={(conversationId) => void switchConversation(conversationId)}
            onTogglePin={togglePin}
          />
          <Tooltip label="New conversation" side="left">
            <button
              type="button"
              onClick={() => void startNewConversation()}
              disabled={!conversationReady || activeConversationEmpty}
              aria-label="Start new Ask Axon conversation"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--axon-editor-foreground)] opacity-40 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-default disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:opacity-20"
            >
              <MessageSquarePlus size={13} />
            </button>
          </Tooltip>
          <Tooltip label="Close" side="left">
            <button
              type="button"
              onClick={props.onClose}
              aria-label="Close Ask Axon"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--axon-editor-foreground)] opacity-40 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
            >
              <X size={13} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={messageScrollRef}
          className="h-full overflow-y-auto px-3.5 py-4"
        >
          {!canChat && (
            <AgentRuntimeStatusPanel
              diagnosticsCount={props.diagnostics.length}
              gitChangeCount={props.gitChanges.length}
              models={models}
              modelStatus={modelStatus}
              pulling={pulling}
              pullEvent={pullEvent}
              pullPercent={pullPercent}
              runtimeLoading={runtimeLoading}
              runtimeStatus={runtimeStatus}
              selectedModel={selectedModel}
              selectedModelInfo={selectedModelInfo}
              selectedModelInstalled={selectedModelInstalled}
              selectedModelLabel={selectedModelLabel}
              onCancelPull={() => void cancelPull()}
              onPullSelectedModel={() => void pullSelectedModel()}
              onSelectModel={setSelectedModel}
            />
          )}
          {conversationReady && messages.length === 0 && canChat && (
            <div className="flex flex-col items-center py-16 text-center">
              <div className="mb-4">
                <AxonIcon size={44} />
              </div>
              <div className="text-[14px] font-medium text-[var(--axon-editor-foreground)]">
                What can I help with?
              </div>
              <div className="mt-2 max-w-[220px] text-[12px] leading-5 text-[var(--axon-editor-foreground)] opacity-40">
                Ask about your code, refactor functions, review changes, or
                explain how things work.
              </div>
            </div>
          )}
          {conversationReady && (
            <AgentMessageList
              copiedId={copiedId}
              messages={messages}
              onApplyEdit={(file) => void applyEdit(file)}
              onOpenLink={openMessageLink}
              onRunTool={(messageId, tool) => void runTool(messageId, tool)}
              onAllowTool={(messageId, tool) => void allowTool(messageId, tool)}
              onSkipTool={(messageId, tool) => void skipTool(messageId, tool)}
              onCopied={(messageId) => {
                setCopiedId(messageId);
                window.setTimeout(() => setCopiedId(null), 1200);
              }}
              streaming={busy}
            />
          )}
        </div>

        {!pinned && messages.length > 0 && (
          <button
            type="button"
            onClick={pinToBottom}
            aria-label="Scroll to latest message"
            className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-2.5 py-1 text-[10px] font-medium text-[var(--axon-editor-foreground)] shadow-lg shadow-black/20 transition-colors hover:border-[var(--axon-syntax-function)]/40 hover:text-[var(--axon-syntax-function)]"
          >
            <ArrowDown size={10} />
            Latest
          </button>
        )}
      </div>

      {clearConversationId && (
        <ClearConversationConfirmModal
          onCancel={() => setClearConversationId(null)}
          onConfirm={() => void confirmClearConversation()}
        />
      )}

      {canChat && (
        <div className="shrink-0 border-t border-[var(--axon-panel-border)] bg-transparent p-3">
          <div className="relative rounded-xl border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] shadow-sm shadow-black/10 transition-colors focus-within:border-[var(--axon-syntax-function)]/45">
            {((contextEnabled.activeFile && props.activeFilePath) ||
              (contextEnabled.diagnostics && props.diagnostics.length > 0) ||
              (contextEnabled.gitChanges && props.gitChanges.length > 0)) && (
              <div className="flex flex-wrap gap-1.5 border-b border-[var(--axon-panel-border)] px-3 py-2">
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
            )}

            <textarea
              ref={textareaRef}
              value={prompt}
              disabled={!conversationReady}
              onChange={(event) => {
                const value = event.target.value;
                setPrompt(value);
                setSlashCommandOpen(value === "/");
              }}
              onKeyDown={(event) => {
                // Shift+Enter and Option+Enter insert a newline; plain Enter sends.
                if (
                  event.key === "Enter" &&
                  (event.shiftKey || event.altKey)
                ) {
                  event.preventDefault();
                  insertNewline(event.currentTarget);
                  return;
                }
                if (event.key === "Enter" && !slashCommandOpen) {
                  event.preventDefault();
                  void runAgent();
                }
                if (event.key === "Escape" && slashCommandOpen) {
                  setSlashCommandOpen(false);
                }
              }}
              placeholder={
                !conversationReady
                  ? "Loading conversation..."
                  : slashCommandOpen
                    ? "Choose a command..."
                    : "Ask Axon anything..."
              }
              className="min-h-[40px] w-full resize-none bg-transparent px-3 py-2.5 text-[13px] leading-5 text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-30 disabled:cursor-default disabled:opacity-40"
              rows={1}
            />

            {slashCommandOpen && conversationReady && (
              <SlashCommandMenu
                onDismiss={() => setSlashCommandOpen(false)}
                onSelect={(selectedAction) => {
                  selectAction(selectedAction);
                  setPrompt("");
                  setSlashCommandOpen(false);
                }}
              />
            )}

            <div className="flex items-center justify-between gap-2 border-t border-[var(--axon-panel-border)] px-2 py-1.5">
              <div className="flex min-w-0 items-center gap-1">
                {canManageModels && (
                  <AgentModelPicker
                    hostMemoryGB={runtimeStatus?.memoryGB}
                    models={models}
                    open={modelPickerOpen}
                    selectedModel={selectedModel}
                    selectedModelAvailable={selectedModelInstalled}
                    selectedModelLabel={selectedModelLabel}
                    onOpenChange={(open) => {
                      setModelPickerOpen(open);
                      if (open) setActionPickerOpen(false);
                    }}
                    onSelect={setSelectedModel}
                  />
                )}
                <div ref={actionPickerRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setActionPickerOpen((open) => !open);
                      setModelPickerOpen(false);
                    }}
                    disabled={!conversationReady}
                    className="flex h-7 max-w-[120px] cursor-pointer items-center gap-1 rounded-md border border-[var(--axon-panel-border)] bg-transparent px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-50 transition-colors hover:border-[var(--axon-syntax-function)]/40 hover:opacity-100 disabled:cursor-default disabled:opacity-20 disabled:hover:border-[var(--axon-panel-border)] disabled:hover:opacity-20"
                    aria-label="Choose AI action"
                  >
                    <span className="truncate">{agentActionLabels[action]}</span>
                    <ChevronDown size={10} className="shrink-0 opacity-40" />
                  </button>
                  {actionPickerOpen && conversationReady && (
                    <div className="axon-popup-surface axon-agent-popup absolute bottom-8 left-0 z-30 w-[190px] overflow-hidden rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] p-1.5 shadow-2xl shadow-black/50">
                      {(["agent", ...agentQuickActions] as AiActionId[]).map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => {
                            selectAction(item);
                            setActionPickerOpen(false);
                          }}
                          className={`flex h-7 w-full cursor-pointer items-center rounded-md px-2 text-left text-[11px] transition ${
                            action === item
                              ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                              : "text-[var(--axon-editor-foreground)] opacity-60 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
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
                  className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--axon-danger-foreground)_35%,transparent)] bg-[color-mix(in_srgb,var(--axon-danger-foreground)_10%,transparent)] px-2.5 text-[11px] font-medium text-[var(--axon-danger-foreground)] transition-colors hover:bg-[color-mix(in_srgb,var(--axon-danger-foreground)_18%,transparent)]"
                >
                  <StopCircle size={12} />
                  Stop
                </button>
              ) : (
                <Tooltip label="Send message" side="top">
                  <button
                    type="button"
                    onClick={() => void runAgent()}
                    disabled={!conversationReady || !prompt.trim()}
                    aria-label="Send message"
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[var(--axon-syntax-function)] text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-25"
                  >
                    <Send size={12} />
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
          {props.folderPath && (
            <div
              className="mt-2 truncate px-1 text-[10px] leading-4 text-[var(--axon-editor-foreground)] opacity-40"
              title={props.folderPath}
            >
              {props.folderPath}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
