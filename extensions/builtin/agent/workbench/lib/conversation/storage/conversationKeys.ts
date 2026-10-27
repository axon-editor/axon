/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const legacyConversationPrefix = "axon:agentConversation:";
const conversationPrefix = "axon:agentConversations:";

export function conversationKey(folderPath: string | null) {
  return `${conversationPrefix}${folderPath ?? "no-workspace"}`;
}

export function legacyConversationKey(folderPath: string | null) {
  return `${legacyConversationPrefix}${folderPath ?? "no-workspace"}`;
}
