/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentConversationState } from "../types/agentConversation";
import { isConversationEmpty } from "./isConversationEmpty";

// The "New conversation" button used to append a blank thread on every press,
// so the picker could hold a stack of identical "New conversation" entries.
// Keeping only the active blank one clears any trail that is already saved while
// still leaving the user with an empty thread to type into.
export function pruneEmptyConversations(
  state: AgentConversationState,
): AgentConversationState {
  const conversations = state.conversations.filter(
    (conversation) =>
      conversation.id === state.activeId ||
      !isConversationEmpty(conversation) ||
      conversation.pinned,
  );
  if (conversations.length === state.conversations.length) return state;
  return {
    activeId: conversations.some(
      (conversation) => conversation.id === state.activeId,
    )
      ? state.activeId
      : conversations[conversations.length - 1].id,
    conversations,
  };
}
