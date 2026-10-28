/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentConversationState } from "../types/agentConversation";
import { flushAgentConversations } from "./saveAgentConversation";

export function saveAgentConversationState(
  folderPath: string | null,
  state: AgentConversationState,
) {
  // Flush the debounced single-conversation write first. Both calls use
  // ipcRenderer.invoke, so the full snapshot lands after the pending message
  // update instead of letting an older conversation file win the race. The
  // pending messages are merged into the snapshot because a pin or a switch can
  // arrive between a streamed token and the save effect that mirrors it into
  // conversationState.
  const pending = flushAgentConversations(folderPath);
  const conversations = state.conversations.map((conversation) => {
    const pendingConversation = pending.get(conversation.id);
    if (!pendingConversation) return conversation;
    return {
      ...conversation,
      title: pendingConversation.title,
      updatedAt: pendingConversation.updatedAt,
      messages: pendingConversation.messages,
    };
  });
  void window.axon
    .saveAgentConversations(folderPath, { ...state, conversations })
    .catch((error) => {
      console.error("failed to save agent conversations:", error);
    });
}
