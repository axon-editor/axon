/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentToolCallState } from "../../../../../lib/conversation";

// Read tools return the whole file in their result. The transcript shows the
// path and an Open action instead, because dumping file contents makes every
// read card larger than the answer the user asked for.
export function isReadTool(tool: AgentToolCallState) {
  return tool.name === "read" || tool.name === "read_file";
}
