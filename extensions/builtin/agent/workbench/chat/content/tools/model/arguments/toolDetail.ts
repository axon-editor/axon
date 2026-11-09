/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentToolCallState } from "../../../../../lib/conversation";
import { PATH_ARGUMENT_KEYS } from "./toolPath";
import { formatArgumentValue } from "./formatArgumentValue";
import { COMMAND_TOOL_NAMES, WRITE_TOOL_NAMES } from "../names/toolNames";

// The card used to show only arguments.path, which left search and problem
// tools looking empty because their inputs are a query or filters, not a path.
// Showing every argument without a dedicated preview keeps the card honest
// about what the agent asked for.
export function toolDetail(
  tool: AgentToolCallState,
  targetPath: string | null,
) {
  const skip = new Set<string>(targetPath ? PATH_ARGUMENT_KEYS : []);
  const entries = Object.entries(tool.arguments).filter(([key]) => {
    if (skip.has(key)) return false;
    if (WRITE_TOOL_NAMES.has(tool.name) && key === "content") return false;
    if (
      COMMAND_TOOL_NAMES.has(tool.name) &&
      (key === "command" || key === "description")
    ) {
      return false;
    }
    return true;
  });
  if (entries.length === 0) return null;
  return entries
    .map(([key, value]) => `${key}: ${formatArgumentValue(value)}`)
    .join("  ·  ");
}
