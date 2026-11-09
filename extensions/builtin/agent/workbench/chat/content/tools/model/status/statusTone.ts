/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentToolCallState } from "../../../../../lib/conversation";

export function statusTone(status: AgentToolCallState["status"]) {
  if (status === "done") {
    return "bg-[var(--axon-git-added)]/12 text-[var(--axon-git-added)]";
  }
  if (status === "rejected" || status === "error") {
    return "bg-[var(--axon-danger-foreground)]/12 text-[var(--axon-danger-foreground)]";
  }
  return "bg-[var(--axon-syntax-function)]/15 text-[var(--axon-syntax-function)]";
}
