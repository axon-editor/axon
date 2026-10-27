/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentTimelineEntry } from "../types/agentConversation";

export function isTimelineEntry(value: unknown): value is AgentTimelineEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== "string") return false;
  if (entry.kind === "status") return typeof entry.label === "string";
  if (entry.kind === "text" || entry.kind === "thought") {
    return typeof entry.content === "string";
  }
  if (entry.kind !== "tool") return false;

  const tool = entry.tool as Record<string, unknown> | null;
  return (
    typeof tool === "object" &&
    tool !== null &&
    typeof tool.id === "string" &&
    typeof tool.name === "string" &&
    typeof tool.kind === "string" &&
    typeof tool.title === "string" &&
    typeof tool.arguments === "object" &&
    tool.arguments !== null &&
    ["pending", "running", "done", "rejected", "error"].includes(
      tool.status as string,
    )
  );
}
