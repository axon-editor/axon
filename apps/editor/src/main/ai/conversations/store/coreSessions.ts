/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type AgentConversationRecord,
  type AgentConversationSnapshot,
} from "../../../../shared/ai/agentConversations";

export interface CoreSessionsEndpoint {
  axonCorePort: string;
  axonCoreToken: string;
}

interface CoreEnvelope<T> {
  status: "success" | "error";
  message?: string;
  data?: T;
}

interface WorkspacePayload {
  activeId: string;
  conversations: AgentConversationRecord[];
}

function coreURL(core: CoreSessionsEndpoint, route: string) {
  return `http://127.0.0.1:${core.axonCorePort}${route}`;
}

function authHeaders(core: CoreSessionsEndpoint) {
  return {
    Authorization: `Bearer ${core.axonCoreToken}`,
    "Content-Type": "application/json",
  };
}

// These helpers are deliberately nullable instead of throwing: the file store
// stays the fallback when Core is still booting or an older build lacks the
// session routes. A conversation must never disappear because persistence moved.
export async function loadCoreWorkspace(
  core: CoreSessionsEndpoint,
  folderPath: string | null,
): Promise<AgentConversationSnapshot | null> {
  try {
    const query = folderPath ? `?path=${encodeURIComponent(folderPath)}` : "";
    const response = await fetch(
      coreURL(core, `/sessions/workspace${query}`),
      { headers: authHeaders(core) },
    );
    if (!response.ok) return null;
    const envelope = (await response
      .json()
      .catch(() => null)) as CoreEnvelope<WorkspacePayload> | null;
    if (envelope?.status !== "success" || !envelope.data) return null;
    return {
      activeId: envelope.data.activeId ?? "",
      conversations: Array.isArray(envelope.data.conversations)
        ? envelope.data.conversations
        : [],
    };
  } catch {
    return null;
  }
}

export async function saveCoreWorkspace(
  core: CoreSessionsEndpoint,
  folderPath: string | null,
  snapshot: AgentConversationSnapshot,
): Promise<boolean> {
  try {
    const response = await fetch(coreURL(core, "/sessions/workspace"), {
      method: "POST",
      headers: authHeaders(core),
      body: JSON.stringify({
        folderPath,
        activeId: snapshot.activeId,
        conversations: snapshot.conversations,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function saveCoreConversation(
  core: CoreSessionsEndpoint,
  folderPath: string | null,
  conversation: AgentConversationRecord,
  activeId: string,
): Promise<boolean> {
  try {
    const response = await fetch(coreURL(core, "/sessions/conversation"), {
      method: "POST",
      headers: authHeaders(core),
      body: JSON.stringify({ folderPath, activeId, conversation }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
