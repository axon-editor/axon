/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type AgentConversation,
  type AgentConversationState,
} from "../types/agentConversation";
import {
  actionFromMessages,
  isAiActionId,
} from "./conversationAction";
import { conversationTitle } from "./conversationTitle";
import { validMessages } from "./validMessages";

export function normalizeState(value: unknown): AgentConversationState | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<AgentConversationState>;
  if (
    typeof candidate.activeId !== "string" ||
    !Array.isArray(candidate.conversations)
  ) {
    return null;
  }
  const conversations = candidate.conversations
    .filter(
      (conversation): conversation is AgentConversation =>
        typeof conversation === "object" &&
        conversation !== null &&
        typeof conversation.id === "string",
    )
    .map((conversation) => {
      const messages = validMessages(conversation.messages);
      return {
        id: conversation.id,
        title: conversation.title || conversationTitle(messages),
        createdAt: conversation.createdAt || Date.now(),
        updatedAt: conversation.updatedAt || Date.now(),
        pinned: Boolean(conversation.pinned),
        action: isAiActionId(conversation.action)
          ? conversation.action
          : actionFromMessages(messages),
        messages,
      };
    })
    .slice(-30);
  if (!conversations.length) return null;
  return {
    activeId: conversations.some(
      (conversation) => conversation.id === candidate.activeId,
    )
      ? candidate.activeId
      : conversations[conversations.length - 1].id,
    conversations,
  };
}
