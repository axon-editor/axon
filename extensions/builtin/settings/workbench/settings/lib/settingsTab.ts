/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The settings surface lives in an editor tab (VS Code-style) instead of a
// modal overlay. A tab is just a path string like every other editor buffer, so
// the virtual "axon-settings:" prefix keeps the settings page distinct from real
// files while still being openable, closable, splittable, and pinnable through
// the normal tab machinery in layoutManager.
export const AXON_SETTINGS_TAB_PATH = "axon-settings:";

export function isSettingsTabPath(tabPath: string) {
  return tabPath === AXON_SETTINGS_TAB_PATH;
}