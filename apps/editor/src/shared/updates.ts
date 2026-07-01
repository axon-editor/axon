export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseUrl: string;
  releaseNotes: string;
  checkedAt: string;
  error?: string;
}

export type UpdateInstallPhase =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "error";

export interface UpdateInstallState {
  phase: UpdateInstallPhase;
  version?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  message?: string;
}

export interface UpdateActionResult {
  ok: boolean;
  message: string;
}
