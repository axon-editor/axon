import { app } from "electron";
import fs from "fs";
import path from "path";

export const EXTENSION_MANIFEST_FILE = "axon.extension.json";

function getRepositoryExtensionsRootPath() {
  const packagedPath = path.join(app.getAppPath(), "extensions");
  const workspaceRootPath = path.resolve(app.getAppPath(), "..", "..", "extensions");

  // Source builds keep bundled extensions at the repository root so the app can
  // grow toward the apps/services/packages/extensions layout without burying
  // product packages inside the Electron app folder. Packaged builds still copy
  // that root folder into the Electron app bundle as app/extensions, so the
  // loader checks the source-tree location first and then falls back to the
  // packaged location.
  return fs.existsSync(workspaceRootPath) ? workspaceRootPath : packagedPath;
}

export function getBundledExtensionsPath() {
  return path.join(getRepositoryExtensionsRootPath(), "builtin");
}

export function getMarketplaceExtensionsPath() {
  return path.join(getRepositoryExtensionsRootPath(), "marketplace");
}

export function getUserExtensionsPath() {
  return path.join(app.getPath("userData"), "extensions");
}

export function getWorkspaceExtensionsPath(folderPath?: string | null) {
  return folderPath ? path.join(folderPath, ".axon", "extensions") : null;
}

export function getExtensionStatePath() {
  return path.join(app.getPath("userData"), "extensions-state.json");
}

export function resolveExtensionPath(extensionPath: string, relativePath: string) {
  return path.resolve(extensionPath, relativePath);
}
