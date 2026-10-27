/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentMessage } from "../types/agentConversation";
import { type AgentToolUpdate } from "./agentToolUpdate";
import { agentTimeline } from "./agentTimeline";
import { definedToolUpdate } from "./definedToolUpdate";
import { timelineTools } from "./timelineTools";

export function updateAgentTool(
  message: AgentMessage,
  toolId: string,
  update: AgentToolUpdate,
): AgentMessage {
  const timeline = agentTimeline(message);
  const patch = definedToolUpdate(update);

  return {
    ...message,
    toolCalls: (message.toolCalls ?? timelineTools(timeline)).map((tool) =>
      tool.id === toolId ? { ...tool, ...patch } : tool,
    ),
    timeline: timeline.map((entry) =>
      entry.kind === "tool" && entry.tool.id === toolId
        ? { ...entry, tool: { ...entry.tool, ...patch } }
        : entry,
    ),
  };
}
