/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentTimelineEntry } from "../types/agentConversation";
import { isTimelineEntry } from "./isTimelineEntry";

export function validTimeline(value: unknown): AgentTimelineEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter(isTimelineEntry).slice(-100);
  return entries.length ? entries : undefined;
}
