/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type AgentConversation,
  type AgentMessage,
} from "../types/agentConversation";
import { conversationTitle } from "./conversationTitle";

export function newConversation(
  messages: AgentMessage[] = [],
): AgentConversation {
  const now = Date.now();
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: conversationTitle(messages),
    createdAt: now,
    updatedAt: now,
    pinned: false,
    action: "agent",
    messages,
  };
}
