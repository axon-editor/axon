/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type AgentMessage,
  type AgentToolCallState,
} from "../agentConversation";
import { agentTimeline } from "./agentTimeline";
import { timelineTools } from "./timelineTools";

export function appendAgentTool(
  message: AgentMessage,
  tool: AgentToolCallState,
): AgentMessage {
  const timeline = agentTimeline(message);
  if (
    timeline.some((entry) => entry.kind === "tool" && entry.tool.id === tool.id)
  ) {
    return message;
  }

  return {
    ...message,
    toolCalls: [...(message.toolCalls ?? timelineTools(timeline)), tool],
    timeline: [...timeline, { id: `tool-${tool.id}`, kind: "tool", tool }],
  };
}
