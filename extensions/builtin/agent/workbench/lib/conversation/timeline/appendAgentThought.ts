/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentMessage } from "../types/agentConversation";
import { agentTimeline } from "./agentTimeline";
import { nextTimelineEntryId } from "./entryId";
import { withoutThinkingPlaceholder } from "./withoutThinkingPlaceholder";

export function appendAgentThought(
  message: AgentMessage,
  content: string,
): AgentMessage {
  if (!content.trim()) return message;

  const timeline = withoutThinkingPlaceholder(agentTimeline(message));
  const last = timeline[timeline.length - 1];

  // Streaming thinking arrives as token-sized chunks. Appending a new block per
  // chunk would flood the timeline, so consecutive chunks extend the open
  // thought. Chunks are kept verbatim because trimming each one would join
  // words that were split across the chunk boundary. A status or tool event
  // between planning turns closes the block.
  if (last?.kind === "thought") {
    return {
      ...message,
      activity: undefined,
      timeline: [
        ...timeline.slice(0, -1),
        { ...last, content: last.content + content },
      ],
    };
  }

  return {
    ...message,
    activity: undefined,
    timeline: [
      ...timeline,
      {
        id: nextTimelineEntryId(message.id, timeline, "thought"),
        kind: "thought",
        content,
      },
    ],
  };
}
