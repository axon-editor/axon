/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentMessage } from "../types/agentConversation";
import { timelineTools } from "../timeline";
import { toolActivityLine } from "./toolActivityLine";

const MAX_SUMMARY_LENGTH = 2000;

// The provider message type only has user and assistant roles, so tool activity
// has to travel as text. A capped summary keeps a long read or search from
// turning one old turn into the whole next request.
export function messageToolActivity(message: AgentMessage) {
  const tools = message.toolCalls ?? timelineTools(message.timeline ?? []);
  const lines = tools.map(toolActivityLine);
  const proposal = message.result?.editProposal;
  if (proposal) {
    const paths = proposal.files.map((file) => file.path).join(", ");
    lines.push(
      `- edit proposal: ${proposal.title}${paths ? ` (${paths})` : ""}`,
    );
  }

  if (lines.length === 0) return "";
  const summary = `Tool activity:\n${lines.join("\n")}`;
  return summary.length > MAX_SUMMARY_LENGTH
    ? `${summary.slice(0, MAX_SUMMARY_LENGTH - 3)}...`
    : summary;
}
