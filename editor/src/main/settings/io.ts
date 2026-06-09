import fs from "fs";
import path from "path";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AxonSettings,
} from "../../shared/settings";
import { getUserSettingsPath, getWorkspaceSettingsPath } from "./paths";

export function readSettingsFromDisk(settingsPath: string): AxonSettings {
  if (!fs.existsSync(settingsPath)) {
    return DEFAULT_SETTINGS;
  }

  try {
    const rawSettings = fs.readFileSync(settingsPath, "utf-8");
    return normalizeSettings(JSON.parse(rawSettings));
  } catch (err) {
    console.error("failed to read settings:", err);
    return DEFAULT_SETTINGS;
  }
}

export function writeSettingsToDisk(
  settings: AxonSettings,
  settingsPath: string,
) {
  // I normalize before writing so both the app settings file and workspace
  // axon.json are always complete, valid documents. That prevents a broken
  // manual edit from leaking invalid editor options into Monaco on the next
  // launch.
  const normalizedSettings = normalizeSettings(settings);
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(normalizedSettings, null, 2),
    "utf-8",
  );

  return normalizedSettings;
}

export function readSettingsForFolder(
  folderPath?: string | null,
): AxonSettings {
  if (folderPath) {
    const workspaceSettingsPath = getWorkspaceSettingsPath(folderPath);
    if (fs.existsSync(workspaceSettingsPath)) {
      return readSettingsFromDisk(workspaceSettingsPath);
    }
  }

  return readSettingsFromDisk(getUserSettingsPath());
}

export { getSettingsPath } from "./paths";
