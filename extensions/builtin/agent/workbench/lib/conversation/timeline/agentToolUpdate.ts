/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AgentToolCallState } from "../agentConversation";

export type AgentToolUpdate = Partial<
  Pick<AgentToolCallState, "status" | "message" | "result">
>;
