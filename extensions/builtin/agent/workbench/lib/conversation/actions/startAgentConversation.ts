/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isConversationEmpty } from "../model/isConversationEmpty";
import { newConversation } from "../model/newConversation";
import { pruneEmptyConversations } from "../model/pruneEmptyConversations";
import { saveAgentConversationState } from "../storage/saveAgentConversationState";
import { type AgentConversationState } from "../types/agentConversation";

export function startAgentConversation(
  folderPath: string | null,
  state: AgentConversationState,
) {
  const active = state.conversations.find(
    (conversation) => conversation.id === state.activeId,
  );
  const pruned = pruneEmptyConversations(state);
  // Pressing "New conversation" while the active thread is still blank used to
  // stack an identical empty entry every time, so the picker filled with
  // duplicates. Reusing the blank thread keeps exactly one empty one in play,
  // while pruning drops any other blanks left over from before.
  if (active && isConversationEmpty(active)) {
    saveAgentConversationState(folderPath, pruned);
    return pruned;
  }
  const conversation = newConversation();
  const nextState = {
    activeId: conversation.id,
    conversations: [...pruned.conversations, conversation].slice(-30),
  };
  saveAgentConversationState(folderPath, nextState);
  return nextState;
}
