/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { newConversation } from "../model/newConversation";
import { normalizeState } from "../model/normalizeState";
import { pruneEmptyConversations } from "../model/pruneEmptyConversations";
import { validMessages } from "../model/validMessages";
import { type AgentConversationState } from "../types/agentConversation";
import { conversationKey, legacyConversationKey } from "./conversationKeys";

export function loadAgentConversationState(
  folderPath: string | null,
): AgentConversationState {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(conversationKey(folderPath)) ?? "null",
    );
    const normalized = normalizeState(parsed);
    if (normalized) return pruneEmptyConversations(normalized);
  } catch {
    // Fall through to legacy migration or a fresh empty conversation.
  }

  try {
    const legacyMessages = validMessages(
      JSON.parse(localStorage.getItem(legacyConversationKey(folderPath)) ?? "[]"),
    );
    if (legacyMessages.length) {
      const conversation = newConversation(legacyMessages);
      return {
        activeId: conversation.id,
        conversations: [conversation],
      };
    }
  } catch {
    // Ignore broken legacy data; a new empty conversation is safer than a crash.
  }

  const conversation = newConversation();
  return {
    activeId: conversation.id,
    conversations: [conversation],
  };
}
