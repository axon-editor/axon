/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { newConversation } from "../model/newConversation";
import { normalizeState } from "../model/normalizeState";
import { pruneEmptyConversations } from "../model/pruneEmptyConversations";
import { validMessages } from "../model/validMessages";
import { type AgentConversationState } from "../types/agentConversation";
import {
  conversationPrefix,
  folderPathFromConversationKey,
  legacyConversationPrefix,
} from "./conversationKeys";

const MIGRATION_FLAG = "axon:agentConversationsMigrated";
let activeMigration: Promise<void> | null = null;

export function migrateLegacyAgentConversations(): Promise<void> {
  if (localStorage.getItem(MIGRATION_FLAG) === "1") return Promise.resolve();
  if (!activeMigration) {
    activeMigration = runMigration().finally(() => {
      activeMigration = null;
    });
  }
  return activeMigration;
}

async function runMigration() {
  const states = new Map<string | null, AgentConversationState>();
  const keysToRemove: string[] = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    const folderPath = folderPathFromConversationKey(key, conversationPrefix);
    if (folderPath === undefined) continue;

    try {
      const normalized = normalizeState(
        JSON.parse(localStorage.getItem(key) ?? "null"),
      );
      if (normalized) {
        states.set(folderPath, pruneEmptyConversations(normalized));
        keysToRemove.push(key);
      }
    } catch {
      // Leave malformed entries in place for manual recovery instead of
      // deleting the only copy while trying to migrate it.
    }
  }

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    const folderPath = folderPathFromConversationKey(
      key,
      legacyConversationPrefix,
    );
    if (folderPath === undefined) continue;
    if (states.has(folderPath)) {
      keysToRemove.push(key);
      continue;
    }

    try {
      const messages = validMessages(
        JSON.parse(localStorage.getItem(key) ?? "[]"),
      );
      if (messages.length) {
        const conversation = newConversation(messages);
        states.set(folderPath, {
          activeId: conversation.id,
          conversations: [conversation],
        });
        keysToRemove.push(key);
      }
    } catch {
      // Same reasoning as the current key: a broken legacy value is not worth
      // deleting when there is nothing to replace it with.
    }
  }

  for (const [folderPath, state] of states) {
    const existing = await window.axon.loadAgentConversations(folderPath);
    if (existing === null) {
      await window.axon.saveAgentConversations(folderPath, state);
    }
  }

  for (const key of keysToRemove) localStorage.removeItem(key);
  localStorage.setItem(MIGRATION_FLAG, "1");
}
