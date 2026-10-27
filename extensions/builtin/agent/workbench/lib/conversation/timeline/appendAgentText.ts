/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentMessage } from "../types/agentConversation";
import { agentTimeline } from "./agentTimeline";
import { nextTimelineEntryId } from "./entryId";
import { withoutThinkingPlaceholder } from "./withoutThinkingPlaceholder";

export function appendAgentText(
  message: AgentMessage,
  delta: string,
): AgentMessage {
  if (!delta) return message;

  const timeline = withoutThinkingPlaceholder(agentTimeline(message));
  const last = timeline[timeline.length - 1];
  const content = message.content + delta;

  // Deltas belong to the text block that is already open. Creating one entry
  // per token would make the timeline huge and break markdown code fences.
  if (last?.kind === "text") {
    return {
      ...message,
      content,
      activity: undefined,
      reveal: true,
      timeline: [
        ...timeline.slice(0, -1),
        { ...last, content: last.content + delta },
      ],
    };
  }

  return {
    ...message,
    content,
    activity: undefined,
    reveal: true,
    timeline: [
      ...timeline,
      {
        id: nextTimelineEntryId(message.id, timeline, "text"),
        kind: "text",
        content: delta,
      },
    ],
  };
}
