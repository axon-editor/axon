/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from "path";
import { type AgentConversationSnapshot } from "../../../../shared/ai/agentConversations";
import { conversationFileName } from "../files/conversationFileName";
import { writeJsonFileAtomic } from "../files/jsonFile";
import {
  normalizedFolderPath,
  workspaceDirectory,
} from "../files/workspaceId";
import {
  type StoredConversationFile,
  type StoredIndex,
} from "../types";
import { isConversationSnapshot } from "../validation/conversationRecord";
import { ensureSessionsRoot } from "./ensureSessionsRoot";
import { removeOrphanConversationFiles } from "./removeOrphanConversationFiles";
import { summarizeConversation } from "./summarizeConversation";
import { writeWorkspaceFile } from "./writeWorkspaceFile";

export function saveWorkspace(
  sessionsRoot: string,
  folderPath: string | null,
  state: AgentConversationSnapshot,
) {
  if (!isConversationSnapshot(state)) {
    throw new Error("Invalid agent conversation state.");
  }

  ensureSessionsRoot(sessionsRoot);
  const normalized = normalizedFolderPath(folderPath);
  const directory = workspaceDirectory(sessionsRoot, normalized);
  const summaries = state.conversations.map((conversation) => {
    const file = conversationFileName(conversation.id);
    writeJsonFileAtomic(path.join(directory, file), {
      version: 1,
      workspacePath: normalized,
      conversation,
    } satisfies StoredConversationFile);
    return summarizeConversation(conversation, file);
  });

  writeWorkspaceFile(directory, normalized);
  writeJsonFileAtomic(path.join(directory, "index.json"), {
    version: 1,
    activeId: state.activeId,
    conversations: summaries,
  } satisfies StoredIndex);

  const keep = new Set(
    summaries
      .map((summary) => summary.file)
      .filter((file): file is string => Boolean(file)),
  );
  removeOrphanConversationFiles(directory, keep);
}
