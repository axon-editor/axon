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
] as const;

export type LanguageServerId = (typeof LANGUAGE_SERVER_IDS)[number];

export interface LanguageServerStatus {
  id: LanguageServerId;
  label: string;
  languages: string[];
  available: boolean;
  relevant: boolean;
  running: boolean;
  startable: boolean;
  command: string;
  detail: string;
  installHint: string;
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
}

export interface LanguageServerCodeAction {
  title: string;
  kind?: string;
  edits: Record<string, LanguageServerTextEdit[]>;
}

export interface LanguageServerCodeActionResult {
  ok: boolean;
  message?: string;
  actions: LanguageServerCodeAction[];
}
