/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentToolCallState } from "../../../../../lib/conversation";
import { COMMAND_TOOL_NAMES } from "../names/toolNames";

// The model explains why it needs the command, and that reason sits above the
// command so the user has context before approving the action.
export function commandReason(tool: AgentToolCallState) {
  if (!COMMAND_TOOL_NAMES.has(tool.name)) return null;
  return typeof tool.arguments.description === "string"
    ? tool.arguments.description
    : null;
}
