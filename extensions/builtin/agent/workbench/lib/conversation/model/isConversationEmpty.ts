/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentConversation } from "../types/agentConversation";

export function isConversationEmpty(conversation: AgentConversation) {
  return !conversation.messages.some(
    (message) => message.role === "user" || message.role === "assistant",
  );
}
