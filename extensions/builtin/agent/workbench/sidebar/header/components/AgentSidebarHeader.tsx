/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessageSquarePlus, X } from "lucide-react";
import Tooltip from "@axon-editor/renderer/shared/components/primitives/Tooltip";
import AxonIcon from "../../../components/AxonIcon";
import {
  type AgentConversation,
  type AgentConversationState,
} from "../../../lib/conversation";
import AgentConversationPicker from "../../conversation/components/AgentConversationPicker";

interface Props {
  activeConversation: AgentConversation;
  activeConversationEmpty: boolean;
  conversationPickerOpen: boolean;
  conversationReady: boolean;
  conversationState: AgentConversationState;
  onClose: () => void;
  onConversationPickerOpenChange: (open: boolean) => void;
  onNewConversation: () => void;
  onRequestClear: (conversationId: string) => void;
  onSelectConversation: (conversationId: string) => void;
  onTogglePin: (conversationId: string) => void;
}

export default function AgentSidebarHeader({
  activeConversation,
  activeConversationEmpty,
  conversationPickerOpen,
  conversationReady,
  conversationState,
  onClose,
  onConversationPickerOpenChange,
  onNewConversation,
  onRequestClear,
  onSelectConversation,
  onTogglePin,
}: Props) {
  return (
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
          onOpenChange={onConversationPickerOpenChange}
          onRequestClear={onRequestClear}
          onSelect={onSelectConversation}
          onTogglePin={onTogglePin}
        />
        <Tooltip label="New conversation" side="left">
          <button
            type="button"
            onClick={onNewConversation}
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
            onClick={onClose}
            aria-label="Close Ask Axon"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--axon-editor-foreground)] opacity-40 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
          >
            <X size={13} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
