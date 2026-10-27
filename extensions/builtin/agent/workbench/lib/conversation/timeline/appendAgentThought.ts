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
  const thought = content.trim();
  if (!thought) return message;

  const timeline = withoutThinkingPlaceholder(agentTimeline(message));

  return {
    ...message,
    activity: undefined,
    timeline: [
      ...timeline,
      {
        id: nextTimelineEntryId(message.id, timeline, "thought"),
        kind: "thought",
        content: thought,
      },
    ],
  };
}
