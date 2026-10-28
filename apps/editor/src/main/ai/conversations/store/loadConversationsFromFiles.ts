/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type AgentConversationSnapshot,
} from "../../../../shared/ai/agentConversations";
import { readConversationFiles } from "./readConversationFiles";

// index.json is a cache. If it is missing or an agent rewrote it incorrectly,
// the self-contained conversation files are still enough to rebuild the
// workspace, so a broken index does not have to mean losing every thread.
export function loadConversationsFromFiles(
  directory: string,
): AgentConversationSnapshot | null {
  const conversations = readConversationFiles(directory)
    .map((entry) => entry.conversation)
    .sort((left, right) => left.updatedAt - right.updatedAt);

  if (!conversations.length) return null;

  return {
    activeId: conversations[conversations.length - 1].id,
    conversations,
  };
}
