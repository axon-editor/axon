/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type AgentConversationRecord,
  type AgentConversationSnapshot,
} from "../../../../shared/ai/agentConversations";
import { workspaceDirectory } from "../files/workspaceId";
import { loadWorkspace } from "./loadWorkspace";
import { saveConversation } from "./saveConversation";
import { saveWorkspace } from "./saveWorkspace";

export class AgentConversationStore {
  constructor(private readonly sessionsRoot: string) {}

  load(folderPath: string | null) {
    return loadWorkspace(this.sessionsRoot, folderPath);
  }

  save(folderPath: string | null, state: AgentConversationSnapshot) {
    saveWorkspace(this.sessionsRoot, folderPath, state);
  }

  saveConversation(
    folderPath: string | null,
    conversation: AgentConversationRecord,
    activeId: string,
  ) {
    saveConversation(this.sessionsRoot, folderPath, conversation, activeId);
  }

  pathFor(folderPath: string | null) {
    return workspaceDirectory(this.sessionsRoot, folderPath);
  }
}
