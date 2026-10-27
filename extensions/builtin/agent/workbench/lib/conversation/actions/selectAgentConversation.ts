/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { saveAgentConversationState } from "../storage/saveAgentConversationState";
import { type AgentConversationState } from "../types/agentConversation";

export function selectAgentConversation(
  folderPath: string | null,
  state: AgentConversationState,
  conversationId: string,
) {
  const nextState = state.conversations.some(
    (conversation) => conversation.id === conversationId,
  )
    ? { ...state, activeId: conversationId }
    : state;
  saveAgentConversationState(folderPath, nextState);
  return nextState;
}
