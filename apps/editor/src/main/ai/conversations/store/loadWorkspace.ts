/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from "path";
import {
  type AgentConversationRecord,
  type AgentConversationSnapshot,
} from "../../../../shared/ai/agentConversations";
import {
  conversationFileName,
  isConversationFileName,
} from "../files/conversationFileName";
import { readJsonFile } from "../files/jsonFile";
import { workspaceDirectory } from "../files/workspaceId";
import {
  type StoredConversationFile,
  type StoredConversationSummary,
} from "../types";
import { isConversationRecord } from "../validation/conversationRecord";
import { isStoredIndex } from "../validation/storedIndex";
import { ensureSessionsRoot } from "./ensureSessionsRoot";
import { loadConversationsFromFiles } from "./loadConversationsFromFiles";

export function loadWorkspace(
  sessionsRoot: string,
  folderPath: string | null,
): AgentConversationSnapshot | null {
  ensureSessionsRoot(sessionsRoot);
  const directory = workspaceDirectory(sessionsRoot, folderPath);
  const indexValue = readJsonFile(path.join(directory, "index.json"));
  if (!isStoredIndex(indexValue)) {
    return loadConversationsFromFiles(directory);
  }

  const conversations = indexValue.conversations
    .map((summary) => readConversation(directory, summary))
    .filter(
      (conversation): conversation is AgentConversationRecord =>
        conversation !== null,
    );

  if (!conversations.length) {
    return { activeId: "", conversations: [] };
  }

  return {
    activeId: conversations.some(
      (conversation) => conversation.id === indexValue.activeId,
    )
      ? indexValue.activeId
      : conversations[conversations.length - 1].id,
    conversations,
  };
}

function readConversation(
  directory: string,
  summary: StoredConversationSummary,
): AgentConversationRecord | null {
  const fileName =
    summary.file && isConversationFileName(summary.file)
      ? summary.file
      : conversationFileName(summary.id);
  const value = readJsonFile(path.join(directory, fileName));
  if (typeof value !== "object" || value === null) return null;

  const file = value as Partial<StoredConversationFile>;
  if (file.version !== 1 || !isConversationRecord(file.conversation)) {
    return null;
  }
  if (file.conversation.id !== summary.id) return null;

  return file.conversation;
}
