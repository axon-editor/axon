export interface CliToolStatus {
  supported: boolean;
  installed: boolean;
  needsUpdate: boolean;
  sourceAvailable: boolean;
  targetPath: string | null;
  sourcePath: string | null;
  installCommand: string | null;
  message?: string;
}

export interface CliToolInstallResult {
  ok: boolean;
  status: CliToolStatus;
  message: string;
}

export interface AgentResumeRequest {
  folderPath: string;
  conversationId: string | null;
}
