/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentToolCallState } from "../../../../../lib/conversation";

// Only these tools point at a single file the editor can open. A grep path can
// be a directory, so showing an Open button there would fail for a common case.
const FILE_TOOLS = new Set([
  "read",
  "read_file",
  "edit",
  "write",
  "write_file",
  "patch",
]);

export function isFileTool(tool: AgentToolCallState) {
  return FILE_TOOLS.has(tool.name);
}
