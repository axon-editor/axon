/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type AgentConversationRecord,
  type AgentConversationSnapshot,
} from "../../../../shared/ai/agentConversations";

export function isConversationRecord(
  value: unknown,
): value is AgentConversationRecord {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<AgentConversationRecord>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.title === "string" &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.updatedAt === "number" &&
    typeof candidate.pinned === "boolean" &&
    typeof candidate.action === "string" &&
    Array.isArray(candidate.messages)
  );
}

export function isConversationSnapshot(
  value: unknown,
): value is AgentConversationSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<AgentConversationSnapshot>;
  return (
    typeof candidate.activeId === "string" &&
    Array.isArray(candidate.conversations) &&
    candidate.conversations.every(isConversationRecord)
  );
}
