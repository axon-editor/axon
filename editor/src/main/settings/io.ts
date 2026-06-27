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

function applyAppAwareSettings(
  settings: AxonSettings,
  appSettings: AxonSettings,
): AxonSettings {
  // Workspace settings can tune project behavior, but the editor chrome should
  // feel like the user's app, not like a property of whatever folder is open.
  // Keeping theme and main sidebar side sourced from user settings prevents a
  // workspace axon.json from moving the sidebar back to the default or changing
  // the shell theme when the user switches projects.
  return {
    ...settings,
    editor: {
      ...settings.editor,
      themeId: appSettings.editor.themeId,
      sidebarSide: appSettings.editor.sidebarSide,
    },
    theme_overrides: appSettings.theme_overrides,
  };
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
  const appSettings = readSettingsFromDisk(getUserSettingsPath());

  if (folderPath) {
    const workspaceSettingsPath = getWorkspaceSettingsPath(folderPath);
    if (fs.existsSync(workspaceSettingsPath)) {
      return applyAppAwareSettings(
        readSettingsFromDisk(workspaceSettingsPath),
        appSettings,
      );
    }
  }

  return appSettings;
}

export { getSettingsPath } from "./paths";
