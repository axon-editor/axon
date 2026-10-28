/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from "path";
import { type AgentConversationRecord } from "../../../../shared/ai/agentConversations";
import { conversationFileName } from "../files/conversationFileName";
import { readJsonFile, writeJsonFileAtomic } from "../files/jsonFile";
import {
  normalizedFolderPath,
  workspaceDirectory,
} from "../files/workspaceId";
import {
  type StoredConversationFile,
  type StoredIndex,
} from "../types";
import { isConversationRecord } from "../validation/conversationRecord";
import { isStoredIndex } from "../validation/storedIndex";
import { ensureSessionsRoot } from "./ensureSessionsRoot";
import { readConversationFiles } from "./readConversationFiles";
import { summarizeConversation } from "./summarizeConversation";
import { writeWorkspaceFile } from "./writeWorkspaceFile";

export function saveConversation(
  sessionsRoot: string,
  folderPath: string | null,
  conversation: AgentConversationRecord,
  activeId: string,
) {
  if (!isConversationRecord(conversation)) {
    throw new Error("Invalid agent conversation.");
  }
  if (typeof activeId !== "string") {
    throw new Error("Invalid active conversation id.");
  }

  ensureSessionsRoot(sessionsRoot);
  const normalized = normalizedFolderPath(folderPath);
  const directory = workspaceDirectory(sessionsRoot, normalized);
  const file = conversationFileName(conversation.id);
  writeJsonFileAtomic(path.join(directory, file), {
    version: 1,
    workspacePath: normalized,
    conversation,
  } satisfies StoredConversationFile);

  const indexPath = path.join(directory, "index.json");
  const existing = readJsonFile(indexPath);
  const index = isStoredIndex(existing) ? existing : null;
  const summary = summarizeConversation(conversation, file);
  // A targeted save still has to preserve the rest of the workspace. If the
  // index was lost or edited into an invalid shape, rebuild it from the
  // conversation files instead of writing an index that only knows about the
  // active thread.
  const summaries = index
    ? index.conversations.map((item) =>
        item.id === conversation.id ? summary : item,
      )
    : readConversationFiles(directory)
        .filter((entry) => entry.conversation.id !== conversation.id)
        .map((entry) => summarizeConversation(entry.conversation, entry.file));
  if (!summaries.some((item) => item.id === conversation.id)) {
    summaries.push(summary);
  }

  writeWorkspaceFile(directory, normalized);
  writeJsonFileAtomic(indexPath, {
    version: 1,
    activeId,
    conversations: summaries,
  } satisfies StoredIndex);
}
