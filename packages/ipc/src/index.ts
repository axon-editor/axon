/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const EXTENSION_IPC_CHANNELS = {
  list: "extensions:list",
  activate: "extensions:activate",
  setEnabled: "extensions:setEnabled",
  reload: "extensions:reload",
  marketplace: "extensions:marketplace",
  themeMarketplace: "extensions:themeMarketplace",
  install: "extensions:install",
  installTheme: "extensions:installTheme",
  uninstall: "extensions:uninstall",
  getReadme: "extensions:getReadme",
  openFolder: "extensions:openFolder",
  executeCommand: "extensions:executeCommand",
} as const;

export type ExtensionIpcChannel =
  (typeof EXTENSION_IPC_CHANNELS)[keyof typeof EXTENSION_IPC_CHANNELS];
