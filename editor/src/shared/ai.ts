import { type EditorDiagnostic } from "./diagnostics";
import { type GitChange } from "./git";

export const AI_ACTION_IDS = [
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

export interface AiEditFileProposal {
  path: string;
  newContent: string;
  summary: string;
}

export interface AiEditProposal {
  title: string;
  files: AiEditFileProposal[];
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
  gitDiff?: string;
  model?: string;
}

export interface AiChatResult {
  success: boolean;
  message: string;
  modelLabel: string;
  providerLabel: string;
  editProposal?: AiEditProposal;
}

export interface AiChatStreamStarted {
  success: boolean;
  requestId: string;
  message?: string;
}

export interface AiChatStreamEvent {
  requestId: string;
  type: "delta" | "done" | "error" | "cancelled";
  delta?: string;
  error?: string;
  done?: boolean;
}

export interface AiModelInfo {
  id: string;
  label: string;
  description?: string;
  providerLabel: string;
  available: boolean;
}

export interface AiRuntimeStatus {
  installed: boolean;
  running: boolean;
  startedByAxon: boolean;
  providerLabel: string;
  selectedModel: string;
  selectedModelInstalled: boolean;
  models: AiModelInfo[];
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
