/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type AgentTimelineEntry,
  type AgentToolCallState,
} from "../types/agentConversation";

// Older messages can have a timeline without the aggregate toolCalls list, so
// every tool update has to recover the list from the ordered entries first.
export function timelineTools(
  timeline: AgentTimelineEntry[],
): AgentToolCallState[] {
  return timeline.flatMap((entry) => (entry.kind === "tool" ? [entry.tool] : []));
}
