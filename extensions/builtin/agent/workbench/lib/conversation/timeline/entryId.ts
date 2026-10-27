/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentTimelineEntry } from "../types/agentConversation";

// Timeline keys only need to be stable for one message. Deriving them from the
// current length avoids a random UUID call for every status line while still
// keeping React from reusing a key after a tool or text block is inserted.
export function nextTimelineEntryId(
  messageId: number,
  timeline: AgentTimelineEntry[],
  kind: string,
) {
  return `${kind}-${messageId}-${timeline.length}`;
}
