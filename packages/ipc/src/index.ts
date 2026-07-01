export const EXTENSION_IPC_CHANNELS = {
  list: "extensions:list",
  setEnabled: "extensions:setEnabled",
  reload: "extensions:reload",
  marketplace: "extensions:marketplace",
  themeMarketplace: "extensions:themeMarketplace",
  install: "extensions:install",
  installTheme: "extensions:installTheme",
  openFolder: "extensions:openFolder",
} as const;

export type ExtensionIpcChannel =
  (typeof EXTENSION_IPC_CHANNELS)[keyof typeof EXTENSION_IPC_CHANNELS];
