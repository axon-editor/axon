/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentMessage } from "../types/agentConversation";

export function conversationTitle(messages: AgentMessage[]) {
  const firstUserMessage = messages.find(
    (message) => message.role === "user" && message.content.trim(),
  );
  const title = firstUserMessage?.content.trim() || "New conversation";
  return title.length > 48 ? `${title.slice(0, 45)}...` : title;
}
