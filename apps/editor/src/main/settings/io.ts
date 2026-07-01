import fs from "fs";
import path from "path";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AxonSettings,
} from "../../shared/settings";
import { getUserSettingsPath, getWorkspaceSettingsPath } from "./paths";

// Settings reads sit on AI, LSP, and startup paths. Keeping this cache keyed by
// file mtime lets those callers use async disk I/O without rereading and
// reparsing axon.json on every completion, diagnostic, or chat request.
const settingsCache = new Map<string, { mtimeMs: number; settings: AxonSettings }>();

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

async function readSettingsFromDiskCached(
  settingsPath: string,
): Promise<AxonSettings> {
  // stat is the cheap invalidation check. It avoids blocking Electron's main
  // process with readFileSync while still picking up manual edits as soon as
  // the file's mtime changes.
  const stat = await fs.promises.stat(settingsPath).catch(() => null);
  if (!stat) {
    settingsCache.delete(settingsPath);
    return DEFAULT_SETTINGS;
  }

  const cached = settingsCache.get(settingsPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.settings;
  }

  try {
    const rawSettings = await fs.promises.readFile(settingsPath, "utf-8");
    const settings = normalizeSettings(JSON.parse(rawSettings));
    // I cache the normalized shape, not the raw JSON, so downstream callers can
    // trust defaults are present and do not repeat validation work in their hot
    // IPC handlers.
    settingsCache.set(settingsPath, {
      mtimeMs: stat.mtimeMs,
      settings,
    });
    return settings;
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
  settingsCache.delete(settingsPath);

  return normalizedSettings;
}

export async function readSettingsForFolder(
  folderPath?: string | null,
): Promise<AxonSettings> {
  const appSettings = await readSettingsFromDiskCached(getUserSettingsPath());

  if (folderPath) {
    const workspaceSettingsPath = getWorkspaceSettingsPath(folderPath);
    const workspaceSettings = await readSettingsFromDiskCached(
      workspaceSettingsPath,
    );
    if (workspaceSettings !== DEFAULT_SETTINGS) {
      // Workspace settings are merged after the app settings are loaded so
      // project-level LSP/runtime choices can vary per folder while app-owned
      // chrome preferences, such as theme and sidebar side, remain stable when
      // switching workspaces.
      return applyAppAwareSettings(workspaceSettings, appSettings);
    }
  }

  return appSettings;
}

export { getSettingsPath } from "./paths";
