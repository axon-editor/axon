/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
