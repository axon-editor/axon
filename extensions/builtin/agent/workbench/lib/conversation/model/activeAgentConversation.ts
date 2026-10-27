/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentConversationState } from "../types/agentConversation";

export function activeAgentConversation(state: AgentConversationState) {
  return (
    state.conversations.find(
      (conversation) => conversation.id === state.activeId,
    ) ?? state.conversations[state.conversations.length - 1]
  );
}
