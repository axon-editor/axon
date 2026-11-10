/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, useState } from "react";
import { type AiActionId, type AiUiState } from "@axon-editor/shared/ai/ai";
import { type EditorDiagnostic } from "@axon-editor/shared/editor/language/diagnostics";
import { type GitChange } from "@axon-editor/shared/workspace/git";
import { defaultPromptForAction } from "../../../lib/actions/agentActions";
import { type AgentToolRunResult } from "../../../lib/actions/agentToolActions";
import { type AgentMessage } from "../../../lib/conversation";
import { useAgentChatStream } from "../../../lib/hooks/useAgentChatStream";
import { useAgentModelRuntime } from "../../../lib/hooks/useAgentModelRuntime";
import { useAgentSidebarResize } from "../../../lib/hooks/useAgentSidebarResize";
import { useStickyScroll } from "../../../lib/hooks/useStickyScroll";
import ClearConversationConfirmModal from "../../../modals/ClearConversationConfirmModal";
import AgentSidebarComposer from "../../composer/components/AgentSidebarComposer";
import AgentSidebarMessages from "../../conversation/components/AgentSidebarMessages";
import { useAgentConversationSession } from "../../conversation/hooks/useAgentConversationSession";
import { useAgentSendMessage } from "../../conversation/hooks/useAgentSendMessage";
import AgentSidebarHeader from "../../header/components/AgentSidebarHeader";
import { useAgentToolActions } from "../../tools/hooks/useAgentToolActions";
import "../../../styles/agentPopups.css";

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
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [composerResetNonce, setComposerResetNonce] = useState(0);
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  // The session hook depends on the stream hook, so the stream's callback is
  // routed through a ref that is wired after the session hook exists.
  const backendSessionSetterRef = useRef<(sessionId: string) => void>(
    () => {},
  );
  const handleBackendSessionId = useCallback((sessionId: string) => {
    backendSessionSetterRef.current(sessionId);
  }, []);

  const {
    activeStreamId,
    beginStream,
    busy,
    cancelActiveStream,
    clearStream,
    setBusy,
  } = useAgentChatStream({
    setMessages,
    onBackendSessionId: handleBackendSessionId,
    onDirectoryCreated: props.onAgentDirectoryCreated,
    onFileWritten: props.onAgentFileWritten,
  });

  const handleConversationReset = useCallback(() => {
    setCopiedId(null);
    setComposerResetNonce((nonce) => nonce + 1);
  }, []);

  const session = useAgentConversationSession({
    folderPath: props.folderPath,
    messages,
    setMessages,
    resumeConversationId: props.resumeConversationId,
    resumeRequested: props.resumeRequested,
    activeStreamId,
    cancelActiveStream,
    clearStream,
    onConversationReset: handleConversationReset,
  });

  useEffect(() => {
    backendSessionSetterRef.current = session.setBackendSessionId;
  }, [session.setBackendSessionId]);

  const modelRuntime = useAgentModelRuntime(props.folderPath);
  const { resize, startResize, stopResize } = useAgentSidebarResize({
    side: props.side,
    width: props.width,
    onWidthChange: props.onWidthChange,
  });
  const { pinToBottom, pinned } = useStickyScroll({
    scrollRef: messageScrollRef,
    contentVersion: messages,
    resetKey: session.conversationState.activeId,
  });
  const toolActions = useAgentToolActions({
    folderPath: props.folderPath,
    setMessages,
    setCopiedId,
    onApplyEdit: props.onApplyEdit,
    onOpenFile: props.onOpenFile,
    onRunAgentAction: props.onRunAgentAction,
  });

  const runAgent = useAgentSendMessage({
    action: session.action,
    backendSessionId: session.activeConversation.backendSessionId,
    busy,
    canChat: modelRuntime.canChat,
    context: props,
    conversationId: session.activeConversation.id,
    conversationReady: session.conversationReady,
    folderPath: props.folderPath,
    messages,
    prompt,
    selectedModel: modelRuntime.selectedModel,
    selectedModelInfo: modelRuntime.selectedModelInfo,
    uiState: props.uiState,
    beginStream,
    pinToBottom,
    selectAction: session.selectAction,
    setBusy,
    setMessages,
    setPrompt,
  });

  useEffect(() => {
    if (!session.conversationReady || !props.initialAction) return;
    const nextAction = props.initialAction.action;
    session.setAction(nextAction);
    void runAgent(nextAction, defaultPromptForAction(nextAction));
    // initialAction.nonce is the trigger; the rest of the dependencies are read
    // from current props/state when the command opens the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.conversationReady, props.initialAction?.nonce]);

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

      <AgentSidebarHeader
        activeConversation={session.activeConversation}
        activeConversationEmpty={session.activeConversationEmpty}
        conversationPickerOpen={session.conversationPickerOpen}
        conversationReady={session.conversationReady}
        conversationState={session.conversationState}
        onClose={props.onClose}
        onConversationPickerOpenChange={session.setConversationPickerOpen}
        onNewConversation={() => void session.startNewConversation()}
        onRequestClear={session.setClearConversationId}
        onSelectConversation={(conversationId) =>
          void session.switchConversation(conversationId)
        }
        onTogglePin={session.togglePin}
      />

      <AgentSidebarMessages
        canChat={modelRuntime.canChat}
        conversationReady={session.conversationReady}
        copiedId={copiedId}
        diagnostics={props.diagnostics}
        gitChanges={props.gitChanges}
        messages={messages}
        modelRuntime={modelRuntime}
        pinned={pinned}
        scrollRef={messageScrollRef}
        streaming={busy}
        onAllowTool={toolActions.allowTool}
        onApplyEdit={toolActions.applyEdit}
        onCopied={toolActions.handleCopied}
        onOpenFile={props.onOpenFile}
        onOpenLink={toolActions.openMessageLink}
        onPinToBottom={pinToBottom}
        onRunTool={toolActions.runTool}
        onSkipTool={toolActions.skipTool}
      />

      {session.clearConversationId && (
        <ClearConversationConfirmModal
          onCancel={() => session.setClearConversationId(null)}
          onConfirm={() => void session.confirmClearConversation()}
        />
      )}

      {session.conversationReady && (
        <AgentSidebarComposer
          action={session.action}
          activeFilePath={props.activeFilePath}
          activeStreamId={activeStreamId}
          busy={busy}
          canChat={modelRuntime.canChat}
          conversationReady={session.conversationReady}
          diagnostics={props.diagnostics}
          folderPath={props.folderPath}
          gitChanges={props.gitChanges}
          modelRuntime={modelRuntime}
          prompt={prompt}
          resetNonce={composerResetNonce}
          onCancelStream={() => void cancelActiveStream()}
          onPromptChange={setPrompt}
          onRunAgent={() => void runAgent()}
          onSelectAction={session.selectAction}
        />
      )}
    </aside>
  );
}
