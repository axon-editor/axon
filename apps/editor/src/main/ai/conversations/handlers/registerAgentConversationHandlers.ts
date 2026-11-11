/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import path from "path";
import { ipcMain } from "electron";
import {
  isConversationRecord,
  isConversationSnapshot,
} from "../validation/conversationRecord";
import { type AgentConversationStore } from "../store/AgentConversationStore";
import {
  type CoreSessionsEndpoint,
  loadCoreWorkspace,
  saveCoreConversation,
  saveCoreWorkspace,
} from "../store/coreSessions";

export function registerAgentConversationHandlers(
  store: AgentConversationStore,
  core?: CoreSessionsEndpoint,
) {
  ipcMain.handle(
    "agentConversations:load",
    async (_event, folderPath: unknown) => {
      assertFolderPath(folderPath);

      if (core) {
        const remote = await loadCoreWorkspace(core, folderPath);
        const local = store.load(folderPath);
        const marker = migrationMarker(store, folderPath);

        // Core has no rows for this workspace: either this is the first launch
        // after the switch or the database was recreated. Import the file store.
        if (!remote || remote.conversations.length === 0) {
          if (local && local.conversations.length > 0) {
            if (await saveCoreWorkspace(core, folderPath, local)) {
              writeMigrationMarker(marker);
            }
            return local;
          }
          if (remote) writeMigrationMarker(marker);
          return remote;
        }

        // Core already has conversations. Import only the file conversations
        // that are missing, and only before the one-time migration marker is
        // written, so a deleted thread is not resurrected on every load.
        if (!fs.existsSync(marker)) {
          const known = new Set(
            remote.conversations.map((conversation) => conversation.id),
          );
          const missing =
            local?.conversations.filter(
              (conversation) => !known.has(conversation.id),
            ) ?? [];
          if (missing.length > 0) {
            const merged = {
              activeId: remote.activeId,
              conversations: [...remote.conversations, ...missing],
            };
            if (await saveCoreWorkspace(core, folderPath, merged)) {
              writeMigrationMarker(marker);
              return merged;
            }
          } else {
            writeMigrationMarker(marker);
          }
        }
        return remote;
      }

      return store.load(folderPath);
    },
  );

  ipcMain.handle(
    "agentConversations:save",
    async (_event, folderPath: unknown, state: unknown) => {
      assertFolderPath(folderPath);
      if (!isConversationSnapshot(state)) {
        throw new Error("Invalid agent conversation state.");
      }
      // Keep the file store in sync while the shared database is new. It is the
      // fallback when Core is restarting, and it is the migration source on the
      // first launch after the switch.
      store.save(folderPath, state);
      if (core) {
        await saveCoreWorkspace(core, folderPath, state);
      }
    },
  );

  ipcMain.handle(
    "agentConversations:saveConversation",
    async (
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
      if (core) {
        await saveCoreConversation(core, folderPath, conversation, activeId);
      }
    },
  );
}

function migrationMarker(
  store: AgentConversationStore,
  folderPath: string | null,
) {
  return path.join(store.pathFor(folderPath), "sqlite-migrated");
}

function writeMigrationMarker(marker: string) {
  try {
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, new Date().toISOString());
  } catch {
    // The marker is an optimization. If it cannot be written, the next load
    // rechecks the file store and simply finds nothing missing.
  }
}

function assertFolderPath(value: unknown): asserts value is string | null {
  if (value !== null && (typeof value !== "string" || value.length === 0)) {
    throw new Error("Invalid workspace path.");
  }
}
