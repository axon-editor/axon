/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentToolCallState } from "../types/agentConversation";

const MAX_ARGUMENT_LENGTH = 120;
const MAX_RESULT_LENGTH = 240;

function truncate(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit
    ? `${normalized.slice(0, limit - 3)}...`
    : normalized;
}

function formatValue(value: unknown) {
  if (typeof value === "string") return truncate(value, MAX_ARGUMENT_LENGTH);
  if (value === null || value === undefined) return String(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return truncate(JSON.stringify(value), MAX_ARGUMENT_LENGTH);
}

function formatArguments(tool: AgentToolCallState) {
  const entries = Object.entries(tool.arguments);
  if (entries.length === 0) return "";

  return entries
    .map(([key, value]) => {
      // write_file content is the whole file. Keeping it here would send the
      // same text back to the model on every later turn and crowd out the
      // conversation, so the path and result carry the useful memory instead.
      if (tool.name === "write_file" && key === "content") {
        const text = typeof value === "string" ? value : "";
        const lines = text ? text.split("\n").length : 0;
        return `content: ${lines} ${lines === 1 ? "line" : "lines"}`;
      }
      return `${key}: ${formatValue(value)}`;
    })
    .join(", ");
}

function toolOutcome(tool: AgentToolCallState) {
  if (tool.status === "rejected") return "skipped";
  if (tool.status === "error") {
    return tool.message
      ? `failed: ${truncate(tool.message, MAX_RESULT_LENGTH)}`
      : "failed";
  }
  if (tool.status === "done") {
    const result = tool.result ?? tool.message;
    return result ? `done: ${truncate(result, MAX_RESULT_LENGTH)}` : "done";
  }
  return tool.status;
}

// The next turn needs to know what the agent actually did, not the full payload
// it used to do it. Each line keeps the tool name, the arguments that identify
// the target, and the outcome so a model can answer "what happened to me.txt?"
// without re-reading the whole tool result.
export function toolActivityLine(tool: AgentToolCallState) {
  const args = formatArguments(tool);
  const call = args ? `${tool.name}(${args})` : tool.name;
  return `- ${call} -> ${toolOutcome(tool)}`;
}
