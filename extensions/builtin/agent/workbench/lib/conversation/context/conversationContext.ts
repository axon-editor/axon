/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AiConversationMessage } from "@axon-editor/shared/ai/ai";
import { type AgentMessage } from "../agentConversation";
import { messageToolActivity } from "./messageToolActivity";

const MAX_CONTEXT_MESSAGES = 12;

function contextContent(message: AgentMessage) {
  const content = message.content.trim();
  const activity = messageToolActivity(message);
  if (!activity) return content;
  return content ? `${content}\n\n${activity}` : activity;
}

// Tool results used to disappear after the turn that produced them, so the
// model could open a file and then claim on the next turn that it had closed
// it. The summary keeps the action history in the same assistant message the
// model already understands instead of adding a provider-specific tool role.
export function conversationContext(
  messages: AgentMessage[],
): AiConversationMessage[] {
  return messages
    .filter(
      (message): message is AgentMessage & { role: "user" | "assistant" } =>
        message.role === "user" || message.role === "assistant",
    )
    .map((message) => ({
      role: message.role,
      content: contextContent(message),
    }))
    .filter((message) => message.content)
    .slice(-MAX_CONTEXT_MESSAGES);
}
