export interface TerminalResizeMessage {
  type: "resize";
  cols: number;
  rows: number;
}

export interface TerminalTerminateMessage {
  type: "terminate";
}

export interface TerminalAckMessage {
  type: "ack";
  offset: number;
}

export type TerminalControlMessage =
  | TerminalResizeMessage
  | TerminalTerminateMessage
  | TerminalAckMessage;

export const TERMINAL_PROTOCOL = {
  endpoint: "/terminal",
  query: {
    sessionId: "sessionId",
    replayFrom: "replayFrom",
    cwd: "cwd",
  },
  control: {
    resize: "resize",
    terminate: "terminate",
    ack: "ack",
  },
} as const;

export const TERMINAL_REPLAY = {
  maxReconnectInputBytes: 64 * 1024,
  ackByteThreshold: 8 * 1024,
  ackDebounceMs: 50,
} as const;
