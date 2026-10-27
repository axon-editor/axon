/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentTimelineEntry } from "../agentConversation";

// "Thinking..." is only a placeholder for the wait before the model produces
// text or a thought. Keeping it after that content arrives leaves a generic
// status line above the real explanation, so drop it when the content lands.
export function withoutThinkingPlaceholder(
  timeline: AgentTimelineEntry[],
): AgentTimelineEntry[] {
  const last = timeline[timeline.length - 1];
  return last?.kind === "status" && last.label === "Thinking..."
    ? timeline.slice(0, -1)
    : timeline;
}
