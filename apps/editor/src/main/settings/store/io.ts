/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import path from "path";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AxonSettings,
} from "../../../shared/core/settings";
import { getUserSettingsPath, getWorkspaceSettingsPath } from "./paths";
import {
  mergeWorkspaceOverlay,
  parseWorkspaceOverlay,
  type WorkspaceSettingsOverlay,
  type WorkspaceSettingsPatch,
} from "../workspace/scope";

// Settings reads sit on AI, LSP, and startup paths. Keeping this cache keyed by
// file mtime lets those callers use async disk I/O without rereading and
// reparsing the user settings on every completion, diagnostic, or chat request.
const settingsCache = new Map<
  string,
  { mtimeMs: number; settings: AxonSettings }
>();
const workspaceOverlayCache = new Map<
  string,
  {
    mtimeMs: number;
    overlay: WorkspaceSettingsPatch | null;
  }
>();

export async function readSettingsFromDisk(
  settingsPath: string,
): Promise<AxonSettings> {
  if (!fs.existsSync(settingsPath)) {
    return DEFAULT_SETTINGS;
  }

  // This function sits on the LSP, AI, and startup paths, so a synchronous read
  // here blocks every IPC message the renderer sends while the disk settles. The
  // async read yields the main-process event loop instead of stalling file
  // opens, completions, and chat requests behind a single settings decode.
  try {
    const rawSettings = await fs.promises.readFile(settingsPath, "utf-8");
    return normalizeSettings(JSON.parse(rawSettings));
  } catch (err) {
    console.error("failed to read settings:", err);
    return DEFAULT_SETTINGS;
  }
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
  // I normalize before writing so the user settings file is always a complete,
  // valid document. That prevents a broken manual edit from leaking invalid
  // editor options into Monaco on the next launch.
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

async function readWorkspaceOverlayCached(
  settingsPath: string,
): Promise<WorkspaceSettingsPatch | null> {
  const stat = await fs.promises.stat(settingsPath).catch(() => null);
  if (!stat) {
    workspaceOverlayCache.delete(settingsPath);
    return null;
  }

  const cached = workspaceOverlayCache.get(settingsPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.overlay;
  }

  try {
    const rawOverlay = await fs.promises.readFile(settingsPath, "utf-8");
    const overlay = parseWorkspaceOverlay(JSON.parse(rawOverlay));
    workspaceOverlayCache.set(settingsPath, {
      mtimeMs: stat.mtimeMs,
      overlay,
    });
    return overlay;
  } catch (err) {
    console.error("failed to read workspace settings:", err);
    return null;
  }
}

export function writeWorkspaceOverlayToDisk(
  overlay: WorkspaceSettingsOverlay,
  settingsPath: string,
) {
  // The workspace file is deliberately partial: writing the whole settings
  // document here is what made a theme save create a project file and let a
  // folder override app chrome on the next launch.
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(overlay, null, 2), "utf-8");
  workspaceOverlayCache.delete(settingsPath);
}

export async function readSettingsForFolder(
  folderPath?: string | null,
): Promise<AxonSettings> {
  const appSettings = await readSettingsFromDiskCached(getUserSettingsPath());

  if (folderPath) {
    const workspaceOverlay = await readWorkspaceOverlayCached(
      getWorkspaceSettingsPath(folderPath),
    );
    // A workspace only contributes its project overlay. Everything else comes
    // from the user file, so switching folders cannot change the theme, glass,
    // typography, or any other chrome preference.
    return mergeWorkspaceOverlay(appSettings, workspaceOverlay);
  }

  return appSettings;
}

export { getSettingsPath } from "./paths";
