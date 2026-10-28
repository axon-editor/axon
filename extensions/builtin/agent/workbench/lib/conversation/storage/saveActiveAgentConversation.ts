/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { conversationTitle } from "../model/conversationTitle";
import {
  type AgentConversationState,
  type AgentMessage,
} from "../types/agentConversation";
import { saveAgentConversation } from "./saveAgentConversation";

export function saveActiveAgentConversation(
  folderPath: string | null,
  state: AgentConversationState,
  messages: AgentMessage[],
): AgentConversationState {
  // The timeline is the conversation history: final text, streamed thinking,
  // status lines, and tool cards. Persisting it is what lets a thread keep its
  // reasoning after the user switches away and back. Transient fields such as
  // reveal and activity are deliberately dropped so old answers do not animate
  // again and no status looks like it is still running.
  const serializableMessages = messages
    .filter(
      (message) =>
        message.role === "user" || message.role === "assistant",
    )
    .filter(
      (message) =>
        message.content.trim() || (message.timeline?.length ?? 0) > 0,
    )
    .slice(-40)
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      action: message.action,
      result: message.result,
      timeline: message.timeline,
    }));
  const now = Date.now();
  const nextState = {
    ...state,
    conversations: state.conversations.map((conversation) =>
      conversation.id === state.activeId
        ? {
            ...conversation,
            title: conversationTitle(serializableMessages),
            updatedAt: now,
            messages: serializableMessages,
          }
        : conversation,
    ),
  };
  const active = nextState.conversations.find(
    (conversation) => conversation.id === nextState.activeId,
  );
  if (active) {
    saveAgentConversation(folderPath, active, nextState.activeId);
  }
  return nextState;
}
