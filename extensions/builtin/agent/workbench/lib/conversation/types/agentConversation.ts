/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type AiActionId,
  type AiChatResult,
  type AiToolKind,
} from "@axon-editor/shared/ai/ai";

export type AgentToolStatus =
  | "pending"
  | "running"
  | "done"
  | "rejected"
  | "error";

export interface AgentToolCallState {
  id: string;
  name: string;
  kind: AiToolKind;
  title: string;
  arguments: Record<string, unknown>;
  status: AgentToolStatus;
  message?: string;
  result?: string;
}

export type AgentTimelineEntry =
  | { id: string; kind: "status"; label: string }
  | { id: string; kind: "text"; content: string }
  | { id: string; kind: "thought"; content: string }
  | { id: string; kind: "tool"; tool: AgentToolCallState };

export interface AgentMessage {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  action?: AiActionId;
  result?: AiChatResult;
  toolCalls?: AgentToolCallState[];
  // Latest status line from the loop ("Thinking...", "Running read_file...") so
  // the indicator can say what the agent is doing while it has no text yet.
  activity?: string;
  // Text, tool cards, and status lines are kept in one ordered list because the
  // old content-then-tools rendering moved every tool card below the final
  // answer even when the tool ran first.
  timeline?: AgentTimelineEntry[];
  // Marks text that arrived during this session so the renderer can type it in.
  // The conversation store drops this flag, so a reloaded thread never
  // re-animates old answers.
  reveal?: boolean;
}

export interface AgentConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  action: AiActionId;
  messages: AgentMessage[];
}

export interface AgentConversationState {
  activeId: string;
  conversations: AgentConversation[];
}
