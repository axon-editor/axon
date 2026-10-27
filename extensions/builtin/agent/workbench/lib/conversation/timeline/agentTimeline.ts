/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type AgentMessage,
  type AgentTimelineEntry,
} from "../agentConversation";
import { nextTimelineEntryId } from "./entryId";

// Threads saved before the timeline existed only kept aggregate content and a
// tool list, so their original event order cannot be recovered. Falling back to
// content-then-tools keeps those old threads readable while new streams build
// the exact order as events arrive.
export function agentTimeline(message: AgentMessage): AgentTimelineEntry[] {
  if (message.timeline) return message.timeline;

  const timeline: AgentTimelineEntry[] = [];
  if (message.content) {
    timeline.push({
      id: nextTimelineEntryId(message.id, timeline, "text"),
      kind: "text",
      content: message.content,
    });
  }
  for (const tool of message.toolCalls ?? []) {
    timeline.push({ id: `tool-${tool.id}`, kind: "tool", tool });
  }
  return timeline;
}
