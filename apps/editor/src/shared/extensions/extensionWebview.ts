/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ExtensionWebviewTarget {
  extensionId: string;
  rootPath: string;
  serverId: string;
  url: string;
}

export interface ExtensionWebviewActionResult {
  ok: boolean;
  message?: string;
  target?: ExtensionWebviewTarget;
}