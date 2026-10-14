/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type AiChatStreamEvent,
  type AiToolCall,
  type AiUiToolResult,
} from "../../../shared/ai/ai";

interface PendingUiTool {
  requestId: string;
  resolve: (result: AiUiToolResult) => void;
}

// UI actions can only run in the renderer, so the main-process loop emits a
// proposal and parks on the returned promise until the renderer reports the
// outcome. Keeping the pending map module-level lets the IPC result handler
// resolve a call without the loop holding a reference to a webContents.
const pending = new Map<string, PendingUiTool>();

export function proposeUiTool(
  requestId: string,
  tool: AiToolCall,
  send: (event: AiChatStreamEvent) => void,
): Promise<AiUiToolResult> {
  return new Promise((resolve) => {
    pending.set(tool.id, { requestId, resolve });
    send({ requestId, type: "tool-proposed", tool });
  });
}

export function resolveUiTool(result: AiUiToolResult): boolean {
  const entry = pending.get(result.callId);
  if (!entry) return false;
  pending.delete(result.callId);
  entry.resolve(result);
  return true;
}

export function rejectUiToolsForRequest(requestId: string): void {
  for (const [callId, entry] of pending) {
    if (entry.requestId !== requestId) continue;
    pending.delete(callId);
    entry.resolve({
      callId,
      ok: false,
      rejected: true,
      message: "Action cancelled.",
    });
  }
}
