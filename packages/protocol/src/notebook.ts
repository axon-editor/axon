/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The notebook host bridges the Jupyter kernel's ZMQ traffic to the renderer over
// a single WebSocket per attached view. The renderer never sees raw Jupyter
// frames: the host tags every streamed message and reply with the renderer's own
// request id so a cell can own its output without tracking kernel msg_ids.

export interface NotebookExecuteMessage {
  type: "execute";
  // Renderer-generated correlation token. The host maps it to the kernel msg_id.
  id: string;
  code: string;
}

export interface NotebookInterruptMessage {
  type: "interrupt";
}

export interface NotebookRestartMessage {
  type: "restart";
}

export interface NotebookShutdownMessage {
  type: "shutdown";
}

export type NotebookClientMessage =
  | NotebookExecuteMessage
  | NotebookInterruptMessage
  | NotebookRestartMessage
  | NotebookShutdownMessage;

export interface NotebookKernelSummary {
  name: string;
  language: string;
}

export interface NotebookReadyMessage {
  type: "ready";
  kernel: NotebookKernelSummary;
}

// A single asynchronous kernel message (stream, display_data, execute_result,
// error, status, ...). content and metadata are the raw Jupyter message bodies.
export interface NotebookIOPubMessage {
  type: "iopub";
  id: string;
  msgType: string;
  content: unknown;
  metadata?: unknown;
}

// The terminal reply for one execute_request, carrying execution_count and the
// final status (ok, error, aborted).
export interface NotebookReplyMessage {
  type: "reply";
  id: string;
  content: unknown;
}

export interface NotebookErrorMessage {
  type: "error";
  id?: string;
  message: string;
}

export interface NotebookExitMessage {
  type: "exit";
}

export type NotebookServerMessage =
  | NotebookReadyMessage
  | NotebookIOPubMessage
  | NotebookReplyMessage
  | NotebookErrorMessage
  | NotebookExitMessage;

export const NOTEBOOK_PROTOCOL = {
  endpoint: "/kernel",
  query: {
    sessionId: "sessionId",
    ticket: "ticket",
  },
  client: {
    execute: "execute",
    interrupt: "interrupt",
    restart: "restart",
    shutdown: "shutdown",
  },
  server: {
    ready: "ready",
    iopub: "iopub",
    reply: "reply",
    error: "error",
    exit: "exit",
  },
} as const;
