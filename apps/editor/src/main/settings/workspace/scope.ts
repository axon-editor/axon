/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AxonSettings } from "../../../shared/core/settings";

// Only the language environment belongs to a folder. Theme, glass, typography,
// and every other chrome preference stay in the user file so opening a project
// cannot repaint the app, and a theme save cannot create a project file.
export interface WorkspaceSettingsOverlay {
  lsp: AxonSettings["lsp"];
}

// The read side accepts a partial overlay because workspace files can be hand
// edited or left over from older builds that wrote the entire settings document.
export interface WorkspaceSettingsPatch {
  lsp?: Partial<AxonSettings["lsp"]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function pickWorkspaceOverlay(
  settings: AxonSettings,
): WorkspaceSettingsOverlay {
  return { lsp: settings.lsp };
}

/**
 * Reading only the known project keys means an old file keeps working for its
 * language environment without letting a stale theme or glass value leak back
 * into the app.
 */
export function parseWorkspaceOverlay(
  raw: unknown,
): WorkspaceSettingsPatch | null {
  if (!isRecord(raw) || !isRecord(raw.lsp)) return null;

  const lsp: Partial<AxonSettings["lsp"]> = {};
  if (typeof raw.lsp.enabled === "boolean") {
    lsp.enabled = raw.lsp.enabled;
  }
  if (typeof raw.lsp.pythonVirtualEnvPath === "string") {
    lsp.pythonVirtualEnvPath = raw.lsp.pythonVirtualEnvPath.trim();
  }
  if (typeof raw.lsp.pythonInterpreterPath === "string") {
    lsp.pythonInterpreterPath = raw.lsp.pythonInterpreterPath.trim();
  }

  return Object.keys(lsp).length > 0 ? { lsp } : null;
}

export function mergeWorkspaceOverlay(
  appSettings: AxonSettings,
  overlay: WorkspaceSettingsPatch | null,
): AxonSettings {
  if (!overlay?.lsp) return appSettings;

  return {
    ...appSettings,
    lsp: { ...appSettings.lsp, ...overlay.lsp },
  };
}

export function lspSettingsEqual(
  a: AxonSettings["lsp"],
  b: AxonSettings["lsp"],
) {
  return (
    a.enabled === b.enabled &&
    a.pythonVirtualEnvPath === b.pythonVirtualEnvPath &&
    a.pythonInterpreterPath === b.pythonInterpreterPath
  );
}
