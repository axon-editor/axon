/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type AgentMessage,
  type AgentToolCallState,
} from "../../types/agentConversation";
import { appendAgentTool } from "../appendAgentTool";
import { agentTimeline } from "../agentTimeline";
import { timelineTools } from "../timelineTools";

// OpenCode announces the same tool twice: first when it is called, then again
// when it asks permission. The permission approval has to update the existing
// card rather than append a second one, otherwise the transcript shows a
// running command and an unrelated pending approval for the same call.
export function upsertAgentTool(
  message: AgentMessage,
  tool: AgentToolCallState,
): AgentMessage {
  const timeline = agentTimeline(message);
  const exists = timeline.some(
    (entry) => entry.kind === "tool" && entry.tool.id === tool.id,
  );
  if (!exists) return appendAgentTool(message, tool);

  const nextTimeline = timeline.map((entry) =>
    entry.kind === "tool" && entry.tool.id === tool.id
      ? { ...entry, tool: { ...entry.tool, ...tool } }
      : entry,
  );
  const nextToolCalls = (message.toolCalls ?? timelineTools(timeline)).map(
    (call) => (call.id === tool.id ? { ...call, ...tool } : call),
  );

  return {
    ...message,
    timeline: nextTimeline,
    toolCalls: nextToolCalls,
  };
}
