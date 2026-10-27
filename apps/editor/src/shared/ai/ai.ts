/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type EditorDiagnostic } from "../editor/language/diagnostics";
import { type GitChange } from "../workspace/git";

export const AI_ACTION_IDS = [
  "agent",
  "ask",
  "explain-selection",
  "fix-problem",
  "refactor-selection",
  "generate-tests",
  "review-git-diff",
  "draft-commit-message",
] as const;

export type AiActionId = (typeof AI_ACTION_IDS)[number];

export interface AiContextFile {
  path: string;
  content: string;
  languageId: string;
  active: boolean;
}

export interface AiConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiProjectContextFile {
  path: string;
  content: string;
  languageId: string;
  size: number;
  truncated: boolean;
}

export interface AiProjectContext {
  root: string;
  tree: string[];
  files: AiProjectContextFile[];
  totalFiles: number;
  includedFiles: number;
  skippedFiles: number;
  truncated: boolean;
}

export interface AiEditFileProposal {
  path: string;
  newContent: string;
  summary: string;
}

export interface AiEditProposal {
  title: string;
  files: AiEditFileProposal[];
}

export interface AiUiState {
  sidebarCollapsed: boolean;
  agentSidebarOpen: boolean;
  terminalOpen: boolean;
  bottomPanelOpen: boolean;
  bottomPanelTab: string | null;
  zenMode: boolean;
  activeFilePath: string | null;
  openFilePaths: string[];
}

export interface AiModelToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown> | string;
  };
}

export interface AiModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  thinking?: string;
  tool_calls?: AiModelToolCall[];
}

export interface AiToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type AiToolKind = "workspace" | "ui" | "editor";

export interface AiToolCall {
  id: string;
  name: string;
  kind: AiToolKind;
  title: string;
  arguments: Record<string, unknown>;
}

export interface AiUiToolResult {
  callId: string;
  ok: boolean;
  rejected?: boolean;
  message?: string;
  // Raw tool output (file contents, search hits, problem lists). Carried back to
  // the renderer only so the tool card can show what the agent actually saw; it
  // is not part of the model's message history.
  result?: string;
}

export interface AiChatRequest {
  action: AiActionId;
  prompt: string;
  folderPath: string | null;
  activeFilePath: string | null;
  files: AiContextFile[];
  diagnostics: EditorDiagnostic[];
  gitChanges: GitChange[];
  conversation: AiConversationMessage[];
  projectContext?: AiProjectContext;
  gitDiff?: string;
  model?: string;
  // The main process owns the agent tool loop and re-sends the full
  // conversation it has accumulated so axon-core can plan the next turn. The
  // renderer leaves these empty.
  messages?: AiModelMessage[];
  tools?: AiToolDefinition[];
  // A snapshot of the workbench so UI actions are grounded in what is visible.
  uiState?: AiUiState;
}

export interface AiChatResult {
  success: boolean;
  message: string;
  modelLabel: string;
  providerLabel: string;
  editProposal?: AiEditProposal;
}

export interface AiInlineCompletionRequest {
  folderPath: string | null;
  filePath: string;
  languageId: string;
  prefix: string;
  suffix: string;
  line: number;
  column: number;
  model?: string;
}

export interface AiInlineCompletionResult {
  success: boolean;
  completion: string;
  message: string;
  modelLabel: string;
  providerLabel: string;
}

export interface AiChatStreamStarted {
  success: boolean;
  requestId: string;
  message?: string;
}

export type AiChatStreamEventType =
  | "delta"
  | "thought"
  | "status"
  | "done"
  | "error"
  | "cancelled"
  | "tool-proposed"
  | "tool-started"
  | "tool-result";

export interface AiChatStreamEvent {
  requestId: string;
  type: AiChatStreamEventType;
  delta?: string;
  thought?: string;
  status?: string;
  error?: string;
  done?: boolean;
  tool?: AiToolCall;
  toolResult?: AiUiToolResult;
}

export type AiModelCompatibility = "great" | "ok" | "unsupported";

export interface AiModelInfo {
  id: string;
  label: string;
  description?: string;
  providerLabel: string;
  available: boolean;
  minMemoryGB?: number;
  recommendedMemoryGB?: number;
  compatibility?: AiModelCompatibility;
}

export interface AiRuntimeStatus {
  installed: boolean;
  running: boolean;
  startedByAxon: boolean;
  providerLabel: string;
  selectedModel: string;
  selectedModelInstalled: boolean;
  models: AiModelInfo[];
  memoryGB?: number;
  detail: string;
  installHint: string;
}

export interface AiPullStarted {
  success: boolean;
  requestId: string;
  message?: string;
}

export interface AiPullEvent {
  requestId: string;
  type: "progress" | "done" | "error" | "cancelled";
  status?: string;
  model: string;
  completed?: number;
  total?: number;
  error?: string;
  done?: boolean;
}
