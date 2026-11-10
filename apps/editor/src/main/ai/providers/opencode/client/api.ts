/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type OpenCodeServerHandle } from "../server/lifecycle";
import {
  type OpenCodeModelResponse,
  type OpenCodePermissionDecision,
  type OpenCodeProviderResponse,
  type OpenCodeSession,
  type OpenCodeSessionModel,
  type OpenCodeSessionResponse,
} from "./types";

interface CreateSessionInput {
  directory: string;
  model: OpenCodeSessionModel;
  title?: string;
}

export interface OpenCodeClient {
  createSession: (input: CreateSessionInput) => Promise<OpenCodeSession>;
  events: (signal: AbortSignal) => Promise<Response>;
  interrupt: (sessionID: string) => Promise<void>;
  models: () => Promise<OpenCodeModelResponse>;
  prompt: (sessionID: string, text: string) => Promise<void>;
  providers: () => Promise<OpenCodeProviderResponse>;
  replyPermission: (
    sessionID: string,
    requestID: string,
    decision: OpenCodePermissionDecision,
    message?: string,
  ) => Promise<void>;
  setModel: (sessionID: string, model: OpenCodeSessionModel) => Promise<void>;
}

export function createOpenCodeClient(
  server: OpenCodeServerHandle,
): OpenCodeClient {
  const authorization = `Basic ${Buffer.from(
    `opencode:${server.password}`,
  ).toString("base64")}`;

  const request = async <T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> => {
    const response = await fetch(`${server.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: authorization,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `OpenCode ${init.method ?? "GET"} ${path} returned ${response.status}: ${detail}`,
      );
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  };

  return {
    createSession: async (input) => {
      const response = await request<OpenCodeSessionResponse>("/api/session", {
        method: "POST",
        body: JSON.stringify({
          title: input.title,
          model: input.model,
          location: { directory: input.directory },
        }),
      });
      return response.data;
    },

    events: (signal) =>
      fetch(`${server.baseUrl}/api/event`, {
        headers: {
          Authorization: authorization,
          Accept: "text/event-stream",
        },
        signal,
      }),

    interrupt: async (sessionID) => {
      await request<void>(`/api/session/${sessionID}/interrupt`, {
        method: "POST",
      });
    },

    models: () => request<OpenCodeModelResponse>("/api/model"),

    prompt: async (sessionID, text) => {
      await request<void>(`/api/session/${sessionID}/prompt`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
    },

    providers: () =>
      request<OpenCodeProviderResponse>("/api/provider"),

    replyPermission: async (
      sessionID,
      requestID,
      decision,
      message,
    ) => {
      await request<void>(
        `/api/session/${sessionID}/permission/${requestID}/reply`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            ...(message ? { message } : {}),
          }),
        },
      );
    },

    setModel: async (sessionID, model) => {
      await request<void>(`/api/session/${sessionID}/model`, {
        method: "POST",
        body: JSON.stringify({ model }),
      });
    },
  };
}
