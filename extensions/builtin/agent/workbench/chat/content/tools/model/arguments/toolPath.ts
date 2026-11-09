/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentToolCallState } from "../../../../../lib/conversation";

// OpenCode and axon-core disagree on the file argument name, so the card
// checks the common keys instead of forcing one provider's schema on the other.
export const PATH_ARGUMENT_KEYS = ["path", "filePath", "file"];

export function toolPath(tool: AgentToolCallState) {
  for (const key of PATH_ARGUMENT_KEYS) {
    const value = tool.arguments[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}
