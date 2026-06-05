export const LANGUAGE_SERVER_IDS = [
  "typescript",
  "cpp",
  "go",
  "rust",
  "python",
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

export interface LanguageServerCompletionRequest {
  folderPath: string;
  filePath: string;
  languageId: string;
  content: string;
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
