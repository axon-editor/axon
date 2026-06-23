export const LANGUAGE_SERVER_IDS = [
  "typescript",
  "cpp",
  "go",
  "rust",
  "python",
  "java",
  "csharp",
  "kotlin",
  "php",
  "lua",
  "docker",
  "tailwind",
  "html",
  "css",
  "json",
  "yaml",
  "bash",
  "svelte",
  "vue",
  "astro",
  "graphql",
  "mdx",
  "prisma",
] as const;

export type LanguageServerId = (typeof LANGUAGE_SERVER_IDS)[number];

export interface LanguageServerStatus {
  id: LanguageServerId;
  label: string;
  languages: string[];
  status: "running" | "available" | "missing" | "failed";
  available: boolean;
  relevant: boolean;
  running: boolean;
  startable: boolean;
  bundled: boolean;
  command: string;
  detail: string;
  installHint: string;
  runtimeHint?: string;
  runtimeRequirement?: string;
  lastError?: string;
}

export interface LanguageServerLifecycleResult {
  ok: boolean;
  message: string;
  servers: LanguageServerStatus[];
}

export interface LanguageServerStartForFileRequest {
  folderPath: string;
  languageId: string;
}

export interface LanguageServerDocumentSyncRequest {
  folderPath: string;
  filePath: string;
  languageId: string;
  content: string;
}

export interface LanguageServerCompletionRequest
  extends LanguageServerDocumentSyncRequest {
  line: number;
  column: number;
  triggerCharacter?: string;
}

export interface LanguageServerTextPosition {
  line: number;
  character: number;
}

export interface LanguageServerTextRange {
  start: LanguageServerTextPosition;
  end: LanguageServerTextPosition;
}

export interface LanguageServerTextEdit {
  range: LanguageServerTextRange;
  newText: string;
}

export interface LanguageServerCompletionItem {
  label: string;
  data?: unknown;
  kind?: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
  insertTextFormat?: number;
  filterText?: string;
  sortText?: string;
  commitCharacters?: string[];
  preselect?: boolean;
  textEdit?: LanguageServerTextEdit;
  additionalTextEdits?: LanguageServerTextEdit[];
}

export interface LanguageServerCompletionResult {
  ok: boolean;
  message?: string;
  items: LanguageServerCompletionItem[];
}

export interface LanguageServerLocation {
  filePath: string;
  range: LanguageServerTextRange;
}

export interface LanguageServerHoverRequest
  extends LanguageServerDocumentSyncRequest {
  line: number;
  column: number;
}

export interface LanguageServerHoverResult {
  ok: boolean;
  message?: string;
  contents: string[];
  range?: LanguageServerTextRange;
}

export interface LanguageServerDefinitionRequest
  extends LanguageServerDocumentSyncRequest {
  line: number;
  column: number;
}

export interface LanguageServerDefinitionResult {
  ok: boolean;
  message?: string;
  locations: LanguageServerLocation[];
}

export interface LanguageServerReferencesRequest
  extends LanguageServerDocumentSyncRequest {
  line: number;
  column: number;
  includeDeclaration?: boolean;
}

export interface LanguageServerReferencesResult {
  ok: boolean;
  message?: string;
  locations: LanguageServerLocation[];
}

export interface LanguageServerRenameRequest
  extends LanguageServerDocumentSyncRequest {
  line: number;
  column: number;
  newName: string;
}

export interface LanguageServerRenameResult {
  ok: boolean;
  message?: string;
  edits: Record<string, LanguageServerTextEdit[]>;
}

export interface LanguageServerFormatRequest
  extends LanguageServerDocumentSyncRequest {
  tabSize: number;
  insertSpaces: boolean;
}

export interface LanguageServerFormatResult {
  ok: boolean;
  message?: string;
  edits: LanguageServerTextEdit[];
}

export interface LanguageServerSignatureHelpRequest
  extends LanguageServerDocumentSyncRequest {
  line: number;
  column: number;
  triggerCharacter?: string;
}

export interface LanguageServerSignatureParameter {
  label: string;
  documentation?: string;
}

export interface LanguageServerSignature {
  label: string;
  documentation?: string;
  parameters: LanguageServerSignatureParameter[];
  activeParameter?: number;
}

export interface LanguageServerSignatureHelpResult {
  ok: boolean;
  message?: string;
  signatures: LanguageServerSignature[];
  activeSignature?: number;
  activeParameter?: number;
}

export interface LanguageServerCodeActionRequest
  extends LanguageServerDocumentSyncRequest {
  range: LanguageServerTextRange;
  diagnostics?: LanguageServerCodeActionDiagnostic[];
}

export interface LanguageServerCodeActionDiagnostic {
  range: LanguageServerTextRange;
  severity?: number;
  code?: string | number;
  source?: string;
  message: string;
}

export interface LanguageServerCodeAction {
  title: string;
  kind?: string;
  command?: LanguageServerCommand;
  edits: Record<string, LanguageServerTextEdit[]>;
}

export interface LanguageServerCommand {
  title?: string;
  command: string;
  arguments?: unknown[];
}

export interface LanguageServerCodeActionResult {
  ok: boolean;
  message?: string;
  actions: LanguageServerCodeAction[];
}

export interface LanguageServerExecuteCommandRequest {
  folderPath: string;
  languageId: string;
  command: string;
  arguments?: unknown[];
}

export interface LanguageServerExecuteCommandResult {
  ok: boolean;
  message?: string;
  edits: Record<string, LanguageServerTextEdit[]>;
}
