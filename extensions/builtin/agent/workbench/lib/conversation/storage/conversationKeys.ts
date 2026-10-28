/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const legacyConversationPrefix = "axon:agentConversation:";
export const conversationPrefix = "axon:agentConversations:";

export function conversationKey(folderPath: string | null) {
  return `${conversationPrefix}${folderPath ?? "no-workspace"}`;
}

export function legacyConversationKey(folderPath: string | null) {
  return `${legacyConversationPrefix}${folderPath ?? "no-workspace"}`;
}

export function folderPathFromConversationKey(
  key: string,
  prefix: string,
): string | null | undefined {
  if (!key.startsWith(prefix)) return undefined;
  const suffix = key.slice(prefix.length);
  return suffix === "no-workspace" ? null : suffix;
}
