/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { saveAgentConversationState } from "../storage/saveAgentConversationState";
import { type AgentConversationState } from "../types/agentConversation";

export function togglePinConversation(
  folderPath: string | null,
  state: AgentConversationState,
  conversationId: string,
) {
  const nextState = {
    ...state,
    conversations: state.conversations.map((conversation) =>
      conversation.id === conversationId
        ? { ...conversation, pinned: !conversation.pinned }
        : conversation,
    ),
  };
  saveAgentConversationState(folderPath, nextState);
  return nextState;
}
