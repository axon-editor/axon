/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import path from "path";
import { type AgentConversationRecord } from "../../../../shared/ai/agentConversations";
import { isConversationFileName } from "../files/conversationFileName";
import { readJsonFile } from "../files/jsonFile";
import { type StoredConversationFile } from "../types";
import { isConversationRecord } from "../validation/conversationRecord";

export interface StoredConversationEntry {
  file: string;
  conversation: AgentConversationRecord;
}

export function readConversationFiles(
  directory: string,
): StoredConversationEntry[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(directory);
  } catch {
    return [];
  }

  const conversations: StoredConversationEntry[] = [];
  for (const file of entries) {
    if (!isConversationFileName(file)) continue;
    const value = readJsonFile(path.join(directory, file));
    if (typeof value !== "object" || value === null) continue;

    const stored = value as Partial<StoredConversationFile>;
    if (stored.version !== 1 || !isConversationRecord(stored.conversation)) {
      continue;
    }
    conversations.push({ file, conversation: stored.conversation });
  }
  return conversations;
}
