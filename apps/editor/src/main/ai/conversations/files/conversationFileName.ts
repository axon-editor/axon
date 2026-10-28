/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from "crypto";

const CONVERSATION_FILE_PREFIX = "conversation-";
const MAX_CONVERSATION_ID_LENGTH = 80;
const CONVERSATION_HASH_LENGTH = 8;

export function conversationFileName(conversationId: string): string {
  if (!conversationId) throw new Error("Conversation id cannot be empty.");

  const safeId = conversationId.replace(/[^A-Za-z0-9_-]/g, "_");
  if (
    safeId === conversationId &&
    safeId.length <= MAX_CONVERSATION_ID_LENGTH
  ) {
    return `${CONVERSATION_FILE_PREFIX}${safeId}.json`;
  }

  // A conversation id can arrive from old localStorage data or from an agent
  // that edited the store. Hashing the original keeps two ids that sanitize to
  // the same string from sharing one file while still keeping the name
  // readable and within filesystem limits.
  const hash = createHash("sha256")
    .update(conversationId)
    .digest("hex")
    .slice(0, CONVERSATION_HASH_LENGTH);
  const readableId = safeId.slice(0, MAX_CONVERSATION_ID_LENGTH);
  return `${CONVERSATION_FILE_PREFIX}${readableId}-${hash}.json`;
}

export function isConversationFileName(fileName: string): boolean {
  return (
    pathBasename(fileName) === fileName &&
    fileName.startsWith(CONVERSATION_FILE_PREFIX) &&
    fileName.endsWith(".json")
  );
}

function pathBasename(fileName: string): string {
  const slash = Math.max(fileName.lastIndexOf("/"), fileName.lastIndexOf("\\"));
  return slash >= 0 ? fileName.slice(slash + 1) : fileName;
}
