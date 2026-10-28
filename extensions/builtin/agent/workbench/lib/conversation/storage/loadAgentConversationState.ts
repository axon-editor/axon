/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { emptyAgentConversationState } from "../model/emptyAgentConversationState";
import { newConversation } from "../model/newConversation";
import { normalizeState } from "../model/normalizeState";
import { pruneEmptyConversations } from "../model/pruneEmptyConversations";
import { validMessages } from "../model/validMessages";
import { type AgentConversationState } from "../types/agentConversation";
import { conversationKey, legacyConversationKey } from "./conversationKeys";
import { migrateLegacyAgentConversations } from "./migrateLegacyAgentConversations";

export async function loadAgentConversationState(
  folderPath: string | null,
): Promise<AgentConversationState> {
  try {
    await migrateLegacyAgentConversations();
  } catch (error) {
    // The current workspace can still migrate its own key below. A failed
    // all-workspace pass must not make the sidebar look empty on every launch.
    console.error("failed to migrate legacy agent conversations:", error);
  }

  const stored = await window.axon.loadAgentConversations(folderPath);
  if (stored !== null) {
    const normalized = normalizeState(stored);
    if (normalized) return pruneEmptyConversations(normalized);

    const empty = emptyAgentConversationState();
    await saveInitialState(folderPath, empty);
    return empty;
  }

  const migrated = readLegacyAgentConversationState(folderPath);
  if (migrated) {
    try {
      await window.axon.saveAgentConversations(folderPath, migrated);
      removeLegacyAgentConversationState(folderPath);
    } catch (error) {
      console.error("failed to migrate agent conversation:", error);
    }
    return migrated;
  }

  const empty = emptyAgentConversationState();
  await saveInitialState(folderPath, empty);
  return empty;
}

function readLegacyAgentConversationState(
  folderPath: string | null,
): AgentConversationState | null {
  try {
    const normalized = normalizeState(
      JSON.parse(localStorage.getItem(conversationKey(folderPath)) ?? "null"),
    );
    if (normalized) return pruneEmptyConversations(normalized);
  } catch {
    // Fall through to the older message-only key.
  }

  try {
    const legacyMessages = validMessages(
      JSON.parse(localStorage.getItem(legacyConversationKey(folderPath)) ?? "[]"),
    );
    if (legacyMessages.length) {
      const conversation = newConversation(legacyMessages);
      return {
        activeId: conversation.id,
        conversations: [conversation],
      };
    }
  } catch {
    // Ignore broken legacy data; a new empty conversation is safer than a crash.
  }

  return null;
}

function removeLegacyAgentConversationState(folderPath: string | null) {
  localStorage.removeItem(conversationKey(folderPath));
  localStorage.removeItem(legacyConversationKey(folderPath));
}

async function saveInitialState(
  folderPath: string | null,
  state: AgentConversationState,
) {
  try {
    await window.axon.saveAgentConversations(folderPath, state);
  } catch (error) {
    console.error("failed to initialize agent conversation store:", error);
  }
}
