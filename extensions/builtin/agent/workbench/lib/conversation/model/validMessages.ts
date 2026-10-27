/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentMessage } from "../types/agentConversation";
import { validResult } from "./validResult";
import { validTimeline } from "./validTimeline";

export function validMessages(value: unknown): AgentMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (message): message is AgentMessage =>
        typeof message === "object" &&
        message !== null &&
        typeof message.id === "number" &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string",
    )
    .slice(-40)
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      action: message.action,
      result: validResult(message.result),
      timeline: validTimeline(message.timeline),
    }));
}
