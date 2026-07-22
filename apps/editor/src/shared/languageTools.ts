export type ManagedLanguageToolId =
  | "cpp"
  | "csharp"
  | "dotnet-sdk"
  | "java"
  | "kotlin"
  | "lua"
  | "proto"
  | "rust"
  | "xml"
  | "sql"
  | "dart"
  | "toml"
  | "terraform"
  | "haskell"
  | "zig"
  | "latex"
  | "clojure"
  | "erlang"
  | "asm"
  | "swift"
  | "ruby"
  | "scala"
  | "r"
  | "powershell"
  | "powershell-runtime"
  | "makefile";

export type ManagedLanguageToolPhase =
  | "idle"
  | "resolving"
  | "downloading"
  | "verifying"
  | "extracting"
  | "installing"
  | "cancelling"
  | "installed"
  | "cancelled"
  | "error";

export interface ManagedLanguageToolStatus {
  id: ManagedLanguageToolId;
  label: string;
  languages: string[];
  installed: boolean;
  supported: boolean;
  version?: string;
  catalogVersion?: string;
  updateAvailable: boolean;
  requiredBy: string[];
  missingDependencies: string[];
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

export function isManagedLanguageToolProgressActive(
  progress: ManagedLanguageToolProgress | null,
) {
  return Boolean(
    progress &&
      [
        "resolving",
        "downloading",
        "verifying",
        "extracting",
        "installing",
        "cancelling",
      ].includes(progress.phase),
  );
}

export interface ManagedLanguageToolInstallResult {
  ok: boolean;
  message: string;
  status: ManagedLanguageToolStatus;
}

export type ManagedLanguageToolActionResult = ManagedLanguageToolInstallResult;
