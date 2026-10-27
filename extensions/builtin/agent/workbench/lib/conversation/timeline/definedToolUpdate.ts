/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentToolUpdate } from "./agentToolUpdate";

// Spreading a partial with an explicit undefined would erase an existing tool
// message or result, so only keys the caller actually set are applied.
export function definedToolUpdate(update: AgentToolUpdate): AgentToolUpdate {
  return Object.fromEntries(
    Object.entries(update).filter(([, value]) => value !== undefined),
  ) as AgentToolUpdate;
}
