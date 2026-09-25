/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const EXTENSION_WEBVIEW_TAB_PREFIX = "axon-extension-webview:";

export function createExtensionWebviewTabPath(extensionId: string) {
  // Extension webview tabs share the layout arrays with file tabs, so their
  // identity must be unambiguous and stable. Encoding the extension id keeps
  // one package's view as a single tab that survives moves, closes, and
  // session persistence without ever colliding with a real file path.
  return `${EXTENSION_WEBVIEW_TAB_PREFIX}${encodeURIComponent(extensionId)}`;
}

export function isExtensionWebviewTabPath(tabPath: string) {
  return tabPath.startsWith(EXTENSION_WEBVIEW_TAB_PREFIX);
}

export function getExtensionWebviewExtensionId(tabPath: string) {
  if (!isExtensionWebviewTabPath(tabPath)) return null;

  try {
    return decodeURIComponent(tabPath.slice(EXTENSION_WEBVIEW_TAB_PREFIX.length));
  } catch {
    return tabPath.slice(EXTENSION_WEBVIEW_TAB_PREFIX.length);
  }
}

export function getExtensionWebviewTabLabel(tabPath: string) {
  const extensionId = getExtensionWebviewExtensionId(tabPath) ?? tabPath;
  const segment = extensionId.split(".").filter(Boolean).pop() ?? extensionId;
  return `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`;
}