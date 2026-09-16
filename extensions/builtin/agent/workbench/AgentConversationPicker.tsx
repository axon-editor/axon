/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState } from "react";
import { ChevronDown, Pin, Search, Trash2 } from "lucide-react";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";
import { type AgentConversationState } from "./lib/agentConversation";

interface Props {
  activeTitle: string;
  conversationState: AgentConversationState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestClear: (conversationId: string) => void;
  onSelect: (conversationId: string) => void;
  onTogglePin: (conversationId: string) => void;
}

export default function AgentConversationPicker(props: Props) {
  const [search, setSearch] = useState("");

  const filtered = props.conversationState.conversations
    .slice()
    .filter((conversation) =>
      search
        ? conversation.title.toLowerCase().includes(search.toLowerCase())
        : true,
    )
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.updatedAt - a.updatedAt;
    });

  return (
    <div className="relative">
      <Tooltip label="Switch Ask Axon conversation" side="left">
        <button
          type="button"
          onClick={() => props.onOpenChange(!props.open)}
          aria-label="Switch Ask Axon conversation"
          className="flex h-8 max-w-[150px] cursor-pointer items-center gap-1 rounded px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-55 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
        >
          <span className="truncate">{props.activeTitle}</span>
          <ChevronDown size={12} />
        </button>
      </Tooltip>
      {props.open && (
        <div className="axon-popup-surface absolute right-0 top-9 z-50 w-72 overflow-hidden rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] shadow-xl shadow-black/40">
          <div className="flex items-center gap-2 border-b border-[var(--axon-panel-border)] px-2 py-1.5">
            <Search size={12} className="shrink-0 text-[var(--axon-editor-foreground)] opacity-40" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search conversations..."
              className="w-full bg-transparent text-[11px] text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-35"
              autoFocus
            />
          </div>

          <div className="max-h-[300px] overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-[11px] text-[var(--axon-editor-foreground)] opacity-40">
                {search ? "No matching conversations" : "No conversations yet"}
              </div>
            )}

            {filtered.map((conversation) => (
              <div
                key={conversation.id}
                className={`flex items-center gap-1 px-2 py-1.5 hover:bg-[var(--axon-panel-overlay-hover)] ${
                  conversation.id === props.conversationState.activeId
                    ? "bg-[var(--axon-panel-overlay-hover)]"
                    : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => props.onSelect(conversation.id)}
                  className={`min-w-0 flex-1 cursor-pointer rounded px-1 py-1 text-left text-[12px] ${
                    conversation.id === props.conversationState.activeId
                      ? "text-[var(--axon-editor-foreground)]"
                      : "text-[var(--axon-editor-foreground)] opacity-65"
                  }`}
                >
                  <span className="block truncate">{conversation.title}</span>
                </button>

                <button
                  type="button"
                  onClick={() => props.onTogglePin(conversation.id)}
                  aria-label={conversation.pinned ? "Unpin conversation" : "Pin conversation"}
                  className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded transition-colors ${
                    conversation.pinned
                      ? "text-[var(--axon-syntax-function)] opacity-100"
                      : "text-[var(--axon-editor-foreground)] opacity-0 hover:opacity-45"
                  }`}
                >
                  <Pin size={11} />
                </button>

                <button
                  type="button"
                  onClick={() => props.onRequestClear(conversation.id)}
                  aria-label={`Clear conversation ${conversation.title}`}
                  className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-0 transition-colors hover:bg-[#2a1720] hover:text-[#ff8f8f] hover:opacity-100"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
