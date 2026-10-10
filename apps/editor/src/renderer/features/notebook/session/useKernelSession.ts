/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, useState } from "react";
import {
  NOTEBOOK_PROTOCOL,
  type NotebookServerMessage,
} from "@axon/protocol";
import { type NotebookCellOutput } from "../lib/nbformat";
import { parseKernelOutput } from "../lib/kernelOutput";

export type KernelStatus =
  | "connecting"
  | "ready"
  | "busy"
  | "disconnected"
  | "error";

export type CellRunStatus = "idle" | "running" | "ok" | "error";

export interface CellRuntime {
  status: CellRunStatus;
  executionCount: number | null;
  outputs: NotebookCellOutput[];
}

export interface KernelSession {
  kernelStatus: KernelStatus;
  kernelError: string | null;
  kernelName: string | null;
  cellRuntime: Record<string, CellRuntime>;
  runCell: (cellId: string, code: string) => void;
  interrupt: () => void;
  restart: () => void;
  resetCell: (cellId: string) => void;
}

const RECONNECT_DELAY_MS = 1500;

function emptyRuntime(): CellRuntime {
  return { status: "idle", executionCount: null, outputs: [] };
}

// useKernelSession owns one WebSocket to the kernel host for one notebook. The
// host keys output by a renderer-generated request id, so this hook can mirror
// streaming output straight into per-cell state without tracking Jupyter msg_ids.
export function useKernelSession(
  notebookPath: string,
  enabled: boolean,
): KernelSession {
  const [kernelStatus, setKernelStatus] = useState<KernelStatus>("connecting");
  const [kernelError, setKernelError] = useState<string | null>(null);
  const [kernelName, setKernelName] = useState<string | null>(null);
  const [cellRuntime, setCellRuntime] = useState<Record<string, CellRuntime>>(
    {},
  );

  const socketRef = useRef<WebSocket | null>(null);
  // The session id is derived from the notebook path so a tab switch that unmounts
  // and remounts this hook reattaches to the same kernel instead of leaving the
  // old one running until the idle reaper reclaims it.
  const sessionIdRef = useRef(`notebook:${notebookPath}`);
  // request id -> owning cell id, so iopub and reply messages resolve back to a
  // cell without the renderer seeing the kernel's own message ids.
  const pendingRef = useRef(new Map<string, string>());
  const runNonceRef = useRef(0);
  const disposedRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);

  const updateCell = useCallback(
    (cellId: string, update: (current: CellRuntime) => CellRuntime) => {
      setCellRuntime((current) => ({
        ...current,
        [cellId]: update(current[cellId] ?? emptyRuntime()),
      }));
    },
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    disposedRef.current = false;
    const pending = pendingRef.current;

    const connect = async () => {
      if (disposedRef.current) return;
      setKernelStatus("connecting");
      try {
        const url = await window.axon.createKernelTicket(
          sessionIdRef.current,
          notebookPath,
        );
        if (disposedRef.current) return;
        const socket = new WebSocket(url);
        socketRef.current = socket;

        socket.onopen = () => {
          if (socketRef.current !== socket) return;
          setKernelStatus("ready");
          setKernelError(null);
        };

        socket.onmessage = (event) => {
          if (socketRef.current !== socket) return;
          let message: NotebookServerMessage;
          try {
            message = JSON.parse(String(event.data)) as NotebookServerMessage;
          } catch {
            return;
          }
          switch (message.type) {
            case "ready":
              setKernelName(message.kernel.name || null);
              setKernelStatus("ready");
              break;
            case "iopub": {
              const cellId = pendingRef.current.get(message.id);
              if (!cellId) break;
              if (message.msgType === "status") {
                const state = (message.content as { execution_state?: string })
                  ?.execution_state;
                if (state === "busy") {
                  updateCell(cellId, (cell) => ({
                    ...cell,
                    status: "running",
                  }));
                }
                break;
              }
              const output = parseKernelOutput(
                message.msgType,
                message.content,
                message.metadata,
              );
              if (output) {
                updateCell(cellId, (cell) => ({
                  ...cell,
                  outputs: appendOutput(cell.outputs, output),
                }));
              }
              break;
            }
            case "reply": {
              const cellId = pendingRef.current.get(message.id);
              if (!cellId) break;
              pendingRef.current.delete(message.id);
              const content = message.content as {
                status?: string;
                execution_count?: number | null;
              };
              updateCell(cellId, (cell) => ({
                ...cell,
                status: content.status === "error" ? "error" : "ok",
                executionCount:
                  typeof content.execution_count === "number"
                    ? content.execution_count
                    : cell.executionCount,
              }));
              break;
            }
            case "error": {
              if (message.id) {
                const cellId = pendingRef.current.get(message.id);
                if (cellId) {
                  pendingRef.current.delete(message.id);
                  updateCell(cellId, (cell) => ({
                    ...cell,
                    status: "error",
                    outputs: appendOutput(cell.outputs, {
                      output_type: "error",
                      ename: "KernelError",
                      evalue: message.message,
                      traceback: [],
                    }),
                  }));
                }
              } else {
                setKernelError(message.message);
              }
              break;
            }
            case "exit":
              setKernelStatus("disconnected");
              break;
          }
        };

        socket.onclose = () => {
          if (socketRef.current !== socket) return;
          socketRef.current = null;
          if (disposedRef.current) return;
          setKernelStatus("disconnected");
          // The kernel host keeps a kernel alive across a renderer reload, so a
          // dropped socket usually means a transient interruption. Reconnecting
          // reattaches to the same session and re-renders its output instead of
          // forcing the user to restart the kernel manually.
          reconnectTimerRef.current = window.setTimeout(() => {
            void connect();
          }, RECONNECT_DELAY_MS);
        };

        socket.onerror = () => {
          if (socketRef.current !== socket) return;
          setKernelStatus("error");
        };
      } catch (error) {
        if (disposedRef.current) return;
        setKernelStatus("error");
        setKernelError(
          error instanceof Error
            ? error.message
            : "The notebook kernel could not be started.",
        );
      }
    };

    void connect();

    return () => {
      disposedRef.current = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
      pending.clear();
    };
  }, [enabled, notebookPath, updateCell]);

  const send = useCallback((payload: unknown) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const runCell = useCallback(
    (cellId: string, code: string) => {
      const requestId = `${cellId}::${(runNonceRef.current += 1)}`;
      if (!send({ type: "execute", id: requestId, code })) {
        updateCell(cellId, (cell) => ({
          ...cell,
          status: "error",
          outputs: [
            {
              output_type: "error",
              ename: "KernelUnavailable",
              evalue: "The notebook kernel is not connected.",
              traceback: [],
            },
          ],
        }));
        return;
      }
      pendingRef.current.set(requestId, cellId);
      updateCell(cellId, () => ({
        status: "running",
        executionCount: null,
        outputs: [],
      }));
    },
    [send, updateCell],
  );

  const interrupt = useCallback(() => {
    send({ type: NOTEBOOK_PROTOCOL.client.interrupt });
  }, [send]);

  const restart = useCallback(() => {
    pendingRef.current.clear();
    setCellRuntime({});
    send({ type: NOTEBOOK_PROTOCOL.client.restart });
  }, [send]);

  const resetCell = useCallback((cellId: string) => {
    setCellRuntime((current) => {
      if (!(cellId in current)) return current;
      const next = { ...current };
      delete next[cellId];
      return next;
    });
  }, []);

  return {
    kernelStatus,
    kernelError,
    kernelName,
    cellRuntime,
    runCell,
    interrupt,
    restart,
    resetCell,
  };
}

// appendOutput coalesces consecutive stream writes of the same channel. Without
// this, a long stdout print would create one output object per flushed chunk and
// the output pane would re-render thousands of times for a single cell.
function appendOutput(
  outputs: NotebookCellOutput[],
  output: NotebookCellOutput,
): NotebookCellOutput[] {
  const last = outputs[outputs.length - 1];
  if (
    last &&
    last.output_type === "stream" &&
    output.output_type === "stream" &&
    last.name === output.name
  ) {
    return [
      ...outputs.slice(0, -1),
      { ...last, text: last.text + output.text },
    ];
  }
  return [...outputs, output];
}
