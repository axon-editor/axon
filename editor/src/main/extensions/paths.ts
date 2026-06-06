import { app } from "electron";
import path from "path";

export const EXTENSION_MANIFEST_FILE = "axon.extension.json";

export function getBundledExtensionsPath() {
  // Bundled extensions live beside package.json so Electron can resolve them
  // from app.getAppPath() in both development and packaged builds. Keeping
  // shipped themes in this normal extension shape prevents the loader from
  // needing a second theme path and makes future bundled extensions follow the
  // same rules as user-installed extensions.
  return path.join(app.getAppPath(), "extensions");
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
