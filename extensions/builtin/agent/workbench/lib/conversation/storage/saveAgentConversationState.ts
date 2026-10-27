/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentConversationState } from "../types/agentConversation";
import { conversationKey } from "./conversationKeys";

export function saveAgentConversationState(
  folderPath: string | null,
  state: AgentConversationState,
) {
  localStorage.setItem(conversationKey(folderPath), JSON.stringify(state));
}
