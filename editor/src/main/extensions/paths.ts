import { app } from "electron";
import path from "path";

export const EXTENSION_MANIFEST_FILE = "axon.extension.json";

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
