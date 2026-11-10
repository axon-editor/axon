/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createOpenCodeClient } from "../client/api";
import { readOpenCodeEvents } from "../client/sse";
import { type OpenCodeServerHandle } from "./lifecycle";

const watchers = new Map<string, AbortController>();
let listener: (() => void) | null = null;

export function setOpenCodeProvidersChangedListener(
  next: (() => void) | null,
) {
  listener = next;
}

// OpenCode reloads its provider and credential state while the server keeps
// running. Watching its event bus lets a paid or newly authenticated model show
// up immediately instead of waiting for the next periodic refresh. The watcher
// is best-effort: the poll remains the fallback when the stream drops.
export function watchOpenCodeProviders(server: OpenCodeServerHandle) {
  if (watchers.has(server.baseUrl)) return;

  const controller = new AbortController();
  watchers.set(server.baseUrl, controller);
  const client = createOpenCodeClient(server);

  void (async () => {
    try {
      const response = await client.events(controller.signal);
      for await (const event of readOpenCodeEvents(response)) {
        if (controller.signal.aborted) break;
        if (
          event.type === "provider.updated" ||
          event.type === "credential.updated" ||
          event.type === "model.updated" ||
          event.type === "integration.updated"
        ) {
          listener?.();
        }
      }
    } catch {
      // The server stopped or the stream dropped. The periodic runtime refresh
      // still detects the next healthy server, so no second reconnect loop is
      // needed here.
    } finally {
      watchers.delete(server.baseUrl);
    }
  })();
}
