export const AXON_REPOSITORY_LAYOUT = {
  apps: "apps",
  editorApp: "apps/editor",
  services: "services",
  coreService: "services/core",
  packages: "packages",
  builtinExtensions: "extensions/builtin",
  marketplaceExtensions: "extensions/marketplace",
  docs: "docs",
  tools: "tools",
} as const;

export const AXON_EXTENSION_PATHS = {
  manifestFile: "axon.extension.json",
  builtinRoot: AXON_REPOSITORY_LAYOUT.builtinExtensions,
  marketplaceRoot: AXON_REPOSITORY_LAYOUT.marketplaceExtensions,
  userFolderName: "extensions",
  workspaceFolderName: ".axon/extensions",
} as const;
