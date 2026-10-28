/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentConversationState } from "../types/agentConversation";
import { newConversation } from "./newConversation";

export function emptyAgentConversationState(): AgentConversationState {
  const conversation = newConversation();
  return {
    activeId: conversation.id,
    conversations: [conversation],
  };
}
