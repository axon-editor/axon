/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AiActionId } from "../../../shared/ai/ai";
import { type AgentConversationRecord } from "../../../shared/ai/agentConversations";

export interface StoredConversationSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  action: AiActionId;
  file?: string;
}

export interface StoredIndex {
  version: 1;
  activeId: string;
  conversations: StoredConversationSummary[];
}

export interface StoredWorkspace {
  version: 1;
  folderPath: string | null;
}

export interface StoredConversationFile {
  version: 1;
  workspacePath: string | null;
  conversation: AgentConversationRecord;
}
