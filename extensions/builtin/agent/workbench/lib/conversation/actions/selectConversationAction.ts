/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AiActionId } from "@axon-editor/shared/ai/ai";
import { saveAgentConversationState } from "../storage/saveAgentConversationState";
import { type AgentConversationState } from "../types/agentConversation";

export function selectConversationAction(
  folderPath: string | null,
  state: AgentConversationState,
  action: AiActionId,
) {
  const nextState = {
    ...state,
    conversations: state.conversations.map((conversation) =>
      conversation.id === state.activeId
        ? { ...conversation, action }
        : conversation,
    ),
  };
  saveAgentConversationState(folderPath, nextState);
  return nextState;
}
