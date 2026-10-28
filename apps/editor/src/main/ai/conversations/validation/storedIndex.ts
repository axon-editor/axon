/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type StoredConversationSummary,
  type StoredIndex,
} from "../types";

export function isStoredIndex(value: unknown): value is StoredIndex {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<StoredIndex>;
  return (
    candidate.version === 1 &&
    typeof candidate.activeId === "string" &&
    Array.isArray(candidate.conversations) &&
    candidate.conversations.every(isStoredConversationSummary)
  );
}

function isStoredConversationSummary(
  value: unknown,
): value is StoredConversationSummary {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<StoredConversationSummary>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.title === "string" &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.updatedAt === "number" &&
    typeof candidate.pinned === "boolean" &&
    typeof candidate.action === "string" &&
    (candidate.file === undefined || typeof candidate.file === "string")
  );
}
