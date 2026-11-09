/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentToolCallState } from "../../../../../lib/conversation";
import { COMMAND_TOOL_NAMES } from "../names/toolNames";

// A shell command can be long enough that a truncated argument row hides the
// part that matters. The approval card shows the full command in its own block
// so the user can read exactly what will run.
export function commandContent(tool: AgentToolCallState) {
  if (!COMMAND_TOOL_NAMES.has(tool.name)) return null;
  return typeof tool.arguments.command === "string"
    ? tool.arguments.command
    : null;
}
