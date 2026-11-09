/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentToolCallState } from "../../../../../lib/conversation";
import { WRITE_TOOL_NAMES } from "../names/toolNames";

export function writeContent(tool: AgentToolCallState) {
  if (!WRITE_TOOL_NAMES.has(tool.name)) return null;
  return typeof tool.arguments.content === "string"
    ? tool.arguments.content
    : null;
}
