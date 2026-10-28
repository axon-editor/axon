/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AiActionId } from "./ai";

// The main process only needs the conversation envelope to persist it. Keeping
// messages as unknown[] lets the renderer own message validation while still
// giving the IPC bridge a concrete shape for the workspace and conversation
// metadata.
export interface AgentConversationRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  action: AiActionId;
  messages: unknown[];
}

export interface AgentConversationSnapshot {
  activeId: string;
  conversations: AgentConversationRecord[];
}
