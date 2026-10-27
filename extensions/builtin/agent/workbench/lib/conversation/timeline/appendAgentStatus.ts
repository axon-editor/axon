/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentMessage } from "../agentConversation";
import { agentTimeline } from "./agentTimeline";
import { nextTimelineEntryId } from "./entryId";

export function appendAgentStatus(
  message: AgentMessage,
  label: string,
): AgentMessage {
  const nextLabel = label.trim();
  if (!nextLabel) return message;

  const timeline = agentTimeline(message);
  const last = timeline[timeline.length - 1];
  // Repeating the same status back to back happens when a round ends without a
  // new event between the loop's status calls. One line is enough.
  if (last?.kind === "status" && last.label === nextLabel) {
    return { ...message, activity: nextLabel, timeline };
  }

  return {
    ...message,
    activity: nextLabel,
    timeline: [
      ...timeline,
      {
        id: nextTimelineEntryId(message.id, timeline, "status"),
        kind: "status",
        label: nextLabel,
      },
    ],
  };
}
