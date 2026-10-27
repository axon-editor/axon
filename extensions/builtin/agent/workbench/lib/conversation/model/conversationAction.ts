/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  AI_ACTION_IDS,
  type AiActionId,
} from "@axon-editor/shared/ai/ai";
import {
  type AgentConversation,
  type AgentMessage,
} from "../types/agentConversation";

export function isAiActionId(value: unknown): value is AiActionId {
  return (
    typeof value === "string" &&
    (AI_ACTION_IDS as readonly string[]).includes(value)
  );
}

export function actionFromMessages(messages: AgentMessage[]): AiActionId {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const action = messages[index].action;
    if (action) return action;
  }
  return "agent";
}

export function conversationAction(
  conversation: AgentConversation | undefined,
): AiActionId {
  if (conversation?.action) return conversation.action;
  return actionFromMessages(conversation?.messages ?? []);
}
