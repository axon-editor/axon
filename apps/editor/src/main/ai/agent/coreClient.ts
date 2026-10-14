/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type AiChatRequest,
  type AiModelMessage,
  type AiToolDefinition,
} from "../../../shared/ai/ai";

interface CoreEnvelope<T> {
  status: "success" | "error";
  message?: string;
  data?: T;
}

interface CoreTurnPayload {
  messages: AiModelMessage[];
  message: AiModelMessage;
}

interface CoreToolRunPayload {
  name: string;
  result: string;
}

function coreError(envelope: unknown, status: number) {
  const message = (envelope as { message?: string } | null)?.message;
  return new Error(message || `axon-core returned ${status}`);
}

// The desktop main process owns the agent tool loop, so it talks to axon-core
// for one planning turn at a time and for the individual project tools. These
// helpers keep that HTTP surface in a single place; the streaming final answer
// still goes through startCoreAiStream.
export async function planTurn(
  core: { axonCorePort: string; axonCoreToken: string },
  request: AiChatRequest,
  signal: AbortSignal,
): Promise<CoreTurnPayload> {
  const response = await fetch(
    `http://127.0.0.1:${core.axonCorePort}/ai/chat/turn`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${core.axonCoreToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal,
    },
  );
  const envelope = (await response
    .json()
    .catch(() => null)) as CoreEnvelope<CoreTurnPayload> | null;
  if (!response.ok || envelope?.status !== "success" || !envelope.data) {
    throw coreError(envelope, response.status);
  }
  return envelope.data;
}

export async function getToolDefinitions(
  core: { axonCorePort: string; axonCoreToken: string },
  signal: AbortSignal,
): Promise<AiToolDefinition[]> {
  const response = await fetch(
    `http://127.0.0.1:${core.axonCorePort}/ai/tool-definitions`,
    {
      headers: { Authorization: `Bearer ${core.axonCoreToken}` },
      signal,
    },
  );
  const envelope = (await response
    .json()
    .catch(() => null)) as CoreEnvelope<AiToolDefinition[]> | null;
  if (!response.ok || envelope?.status !== "success") {
    throw coreError(envelope, response.status);
  }
  return envelope.data ?? [];
}

export async function runTool(
  core: { axonCorePort: string; axonCoreToken: string },
  input: {
    folderPath: string;
    name: string;
    arguments: Record<string, unknown>;
  },
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(
    `http://127.0.0.1:${core.axonCorePort}/ai/run-tool`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${core.axonCoreToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        folderPath: input.folderPath,
        name: input.name,
        arguments: input.arguments,
      }),
      signal,
    },
  );
  const envelope = (await response
    .json()
    .catch(() => null)) as CoreEnvelope<CoreToolRunPayload> | null;
  if (!response.ok || envelope?.status !== "success" || !envelope.data) {
    throw coreError(envelope, response.status);
  }
  return envelope.data.result;
}
