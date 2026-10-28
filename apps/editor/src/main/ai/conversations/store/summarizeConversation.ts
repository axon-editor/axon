/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentConversationRecord } from "../../../../shared/ai/agentConversations";
import { type StoredConversationSummary } from "../types";

export function summarizeConversation(
  conversation: AgentConversationRecord,
  file: string,
): StoredConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    pinned: conversation.pinned,
    action: conversation.action,
    file,
  };
}
