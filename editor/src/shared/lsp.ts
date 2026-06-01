export const LANGUAGE_SERVER_IDS = [
  "typescript",
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
  command: string;
  detail: string;
  installHint: string;
}
