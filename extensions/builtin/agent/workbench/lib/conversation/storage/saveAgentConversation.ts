/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentConversation } from "../types/agentConversation";

const AGENT_CONVERSATION_SAVE_DELAY_MS = 400;

interface PendingConversationSave {
  folderPath: string | null;
  conversation: AgentConversation;
  activeId: string;
  timer: ReturnType<typeof setTimeout>;
}

const pendingSaves = new Map<string, PendingConversationSave>();

export function saveAgentConversation(
  folderPath: string | null,
  conversation: AgentConversation,
  activeId: string,
) {
  const key = pendingKey(folderPath, conversation.id);
  const existing = pendingSaves.get(key);
  if (existing) clearTimeout(existing.timer);

  // Streaming updates arrive much faster than the disk needs to see them. The
  // debounce is per conversation so switching threads cannot cancel a pending
  // save for the one that just went out of view.
  const timer = setTimeout(() => {
    pendingSaves.delete(key);
    sendSave(folderPath, conversation, activeId);
  }, AGENT_CONVERSATION_SAVE_DELAY_MS);
  pendingSaves.set(key, { folderPath, conversation, activeId, timer });
}

export function flushAgentConversations(
  folderPath: string | null,
): Map<string, AgentConversation> {
  const flushed = new Map<string, AgentConversation>();
  for (const [key, pending] of pendingSaves) {
    if (pending.folderPath !== folderPath) continue;
    clearTimeout(pending.timer);
    pendingSaves.delete(key);
    flushed.set(pending.conversation.id, pending.conversation);
    sendSave(pending.folderPath, pending.conversation, pending.activeId);
  }
  return flushed;
}

export function flushAllAgentConversations() {
  for (const [key, pending] of pendingSaves) {
    clearTimeout(pending.timer);
    pendingSaves.delete(key);
    sendSave(pending.folderPath, pending.conversation, pending.activeId);
  }
}

function sendSave(
  folderPath: string | null,
  conversation: AgentConversation,
  activeId: string,
) {
  void window.axon
    .saveAgentConversation(folderPath, conversation, activeId)
    .catch((error) => {
      console.error("failed to save agent conversation:", error);
    });
}

function pendingKey(folderPath: string | null, conversationId: string) {
  return `${folderPath ?? ""}\u0000${conversationId}`;
}
