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

export interface OpenWorkspaceFolder {
  path: string;
  name: string;
  rendererId: number;
  currentWindow: boolean;
}

export interface CoreRequest {
  id: string;
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
}

export interface CoreResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
