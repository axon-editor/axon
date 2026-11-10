/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type RefObject } from "react";
import { ArrowDown } from "lucide-react";
import { type AiEditFileProposal } from "@axon-editor/shared/ai/ai";
import { type EditorDiagnostic } from "@axon-editor/shared/editor/language/diagnostics";
import { type GitChange } from "@axon-editor/shared/workspace/git";
import AxonIcon from "../../../components/AxonIcon";
import AgentMessageList from "../../../chat/messages/list/components/AgentMessageList";
import {
  type AgentMessage,
  type AgentToolCallState,
} from "../../../lib/conversation";
import { type AgentModelRuntimeState } from "../../../lib/hooks/useAgentModelRuntime";
import AgentRuntimeStatusPanel from "../../runtime/components/AgentRuntimeStatusPanel";

interface Props {
  canChat: boolean;
  conversationReady: boolean;
  copiedId: number | null;
  diagnostics: EditorDiagnostic[];
  gitChanges: GitChange[];
  messages: AgentMessage[];
  modelRuntime: AgentModelRuntimeState;
  pinned: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  streaming: boolean;
  onAllowTool: (messageId: number, tool: AgentToolCallState) => void;
  onApplyEdit: (file: AiEditFileProposal) => void;
  onCopied: (messageId: number) => void;
  onOpenFile: (path: string) => void;
  onOpenLink: (href: string) => void;
  onPinToBottom: () => void;
  onReconnectOpenCode: () => void;
  onRunTool: (messageId: number, tool: AgentToolCallState) => void;
  onSkipTool: (messageId: number, tool: AgentToolCallState) => void;
  reconnectDisabled: boolean;
}

export default function AgentSidebarMessages({
  canChat,
  conversationReady,
  copiedId,
  diagnostics,
  gitChanges,
  messages,
  modelRuntime,
  pinned,
  scrollRef,
  streaming,
  onAllowTool,
  onApplyEdit,
  onCopied,
  onOpenFile,
  onOpenLink,
  onPinToBottom,
  onReconnectOpenCode,
  onRunTool,
  onSkipTool,
  reconnectDisabled,
}: Props) {
  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} className="h-full overflow-y-auto px-3.5 py-4">
        {!canChat && (
          <AgentRuntimeStatusPanel
            diagnosticsCount={diagnostics.length}
            gitChangeCount={gitChanges.length}
            models={modelRuntime.models}
            modelStatus={modelRuntime.modelStatus}
            pulling={modelRuntime.pulling}
            pullEvent={modelRuntime.pullEvent}
            pullPercent={modelRuntime.pullPercent}
            runtimeLoading={modelRuntime.runtimeLoading}
            runtimeStatus={modelRuntime.runtimeStatus}
            selectedModel={modelRuntime.selectedModel}
            selectedModelInfo={modelRuntime.selectedModelInfo}
            selectedModelInstalled={modelRuntime.selectedModelInstalled}
            selectedModelLabel={modelRuntime.selectedModelLabel}
            onCancelPull={() => void modelRuntime.cancelPull()}
            onPullSelectedModel={() => void modelRuntime.pullSelectedModel()}
            onReconnectOpenCode={onReconnectOpenCode}
            onSelectModel={modelRuntime.setSelectedModel}
            reconnectDisabled={reconnectDisabled}
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
              Ask about your code, refactor functions, review changes, or explain
              how things work.
            </div>
          </div>
        )}
        {conversationReady && (
          <AgentMessageList
            copiedId={copiedId}
            messages={messages}
            onApplyEdit={onApplyEdit}
            onOpenLink={onOpenLink}
            onOpenFile={onOpenFile}
            onRunTool={onRunTool}
            onAllowTool={onAllowTool}
            onSkipTool={onSkipTool}
            onCopied={onCopied}
            streaming={streaming}
          />
        )}
      </div>

      {!pinned && messages.length > 0 && (
        <button
          type="button"
          onClick={onPinToBottom}
          aria-label="Scroll to latest message"
          className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-2.5 py-1 text-[10px] font-medium text-[var(--axon-editor-foreground)] shadow-lg shadow-black/20 transition-colors hover:border-[var(--axon-syntax-function)]/40 hover:text-[var(--axon-syntax-function)]"
        >
          <ArrowDown size={10} />
          Latest
        </button>
      )}
    </div>
  );
}
