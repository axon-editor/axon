/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcMain } from "electron";
import {
  isConversationRecord,
  isConversationSnapshot,
} from "../validation/conversationRecord";
import { type AgentConversationStore } from "../store/AgentConversationStore";

export function registerAgentConversationHandlers(
  store: AgentConversationStore,
) {
  ipcMain.handle(
    "agentConversations:load",
    (_event, folderPath: unknown) => {
      assertFolderPath(folderPath);
      return store.load(folderPath);
    },
  );

  ipcMain.handle(
    "agentConversations:save",
    (_event, folderPath: unknown, state: unknown) => {
      assertFolderPath(folderPath);
      if (!isConversationSnapshot(state)) {
        throw new Error("Invalid agent conversation state.");
      }
      store.save(folderPath, state);
    },
  );

  ipcMain.handle(
    "agentConversations:saveConversation",
    (
      _event,
      folderPath: unknown,
      conversation: unknown,
      activeId: unknown,
    ) => {
      assertFolderPath(folderPath);
      if (!isConversationRecord(conversation)) {
        throw new Error("Invalid agent conversation.");
      }
      if (typeof activeId !== "string") {
        throw new Error("Invalid active conversation id.");
      }
      store.saveConversation(folderPath, conversation, activeId);
    },
  );
}

function assertFolderPath(value: unknown): asserts value is string | null {
  if (value !== null && (typeof value !== "string" || value.length === 0)) {
    throw new Error("Invalid workspace path.");
  }
}
