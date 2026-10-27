/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { stripEditProposalJson } from "../../helpers/agentWorkbenchHelpers";
import {
  type AgentMessage,
  type AgentTimelineEntry,
} from "../types/agentConversation";
import { agentTimeline } from "./agentTimeline";
import { nextTimelineEntryId } from "./entryId";

export function finalizeAgentTimeline(
  message: AgentMessage,
  content: string,
): AgentMessage {
  const timeline = agentTimeline(message);
  const nextTimeline: AgentTimelineEntry[] = [];
  let keptTextEntries = 0;

  for (const entry of timeline) {
    if (entry.kind !== "text") {
      nextTimeline.push(entry);
      continue;
    }

    const stripped = stripEditProposalJson(entry.content);
    if (!stripped) continue;
    keptTextEntries += 1;
    nextTimeline.push({ ...entry, content: stripped });
  }

  if (keptTextEntries === 0 && content.trim()) {
    nextTimeline.push({
      id: nextTimelineEntryId(message.id, nextTimeline, "text"),
      kind: "text",
      content,
    });
  }

  return { ...message, activity: undefined, content, timeline: nextTimeline };
}
