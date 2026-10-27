/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { newConversation } from "../model/newConversation";
import { saveAgentConversationState } from "../storage/saveAgentConversationState";
import { type AgentConversationState } from "../types/agentConversation";

export function clearAgentConversation(
  folderPath: string | null,
  state: AgentConversationState,
  conversationId: string,
) {
  const remainingConversations = state.conversations.filter(
    (conversation) => conversation.id !== conversationId,
  );
  const conversations = remainingConversations.length
    ? remainingConversations
    : [newConversation()];
  const nextState = {
    activeId: conversations.some(
      (conversation) => conversation.id === state.activeId,
    )
      ? state.activeId
      : conversations[conversations.length - 1].id,
    conversations,
  };
  saveAgentConversationState(folderPath, nextState);
  return nextState;
}
