export type ManagedLanguageToolId =
  | "cpp"
  | "csharp"
  | "dotnet-sdk"
  | "java"
  | "kotlin"
  | "lua"
  | "proto"
  | "rust"
  | "xml";

export type ManagedLanguageToolPhase =
  | "idle"
  | "resolving"
  | "downloading"
  | "verifying"
  | "installing"
  | "installed"
  | "error";

export interface ManagedLanguageToolStatus {
  id: ManagedLanguageToolId;
  label: string;
  languages: string[];
  installed: boolean;
  supported: boolean;
  version?: string;
  size?: number;
  detail: string;
}

export interface ManagedLanguageToolProgress {
  id: ManagedLanguageToolId;
  phase: ManagedLanguageToolPhase;
  transferred?: number;
  total?: number;
  percent?: number;
  message?: string;
}

export interface ManagedLanguageToolInstallResult {
  ok: boolean;
  message: string;
  status: ManagedLanguageToolStatus;
}
