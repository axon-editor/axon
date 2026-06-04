export interface HtmlPreviewTarget {
  filePath: string;
  rootPath: string;
  serverId: string;
  url: string;
}

export interface HtmlPreviewConsoleEvent {
  id: string;
  serverId: string;
  level: "log" | "info" | "warn" | "error";
  message: string;
  source?: string;
  line?: number;
  column?: number;
  timestamp: number;
}

export interface HtmlPreviewActionResult {
  ok: boolean;
  message?: string;
  target?: HtmlPreviewTarget;
}
