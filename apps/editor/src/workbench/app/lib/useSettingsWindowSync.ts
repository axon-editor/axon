/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Routes OPEN_SETTINGS between the editor tab and the dedicated settings window,
// and subscribes every editor window to the settings window's live broadcasts.
// Kept out of useAxonAppViewModel so the settings-specific wiring stays in one
// focused hook instead of growing the app shell's hub file.

import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import { type AxonSettings, normalizeSettings } from "../../../shared/settings";
import { type Layout } from "../../../renderer/features/editor/lib/layout/types";
import { openFileInPane } from "../../../renderer/features/editor/lib/layout/layoutManager";
import { type BottomPanelTab } from "../../../platform/panel/bottomPanel";
import { AXON_SETTINGS_TAB_PATH } from "@axon-builtin-settings/settings/lib/settingsTab";
import { type SettingsWorkbenchContribution } from "@axon-builtin-settings/lib/contribution";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

interface SettingsWindowSyncOptions {
  settings: AxonSettings;
  settingsContribution: SettingsWorkbenchContribution | null;
  handleSettingsPreview: (nextSettings: AxonSettings) => void;
  setLayout: StateSetter<Layout>;
  setSettings: StateSetter<AxonSettings>;
  setLanguageToolsOpen: StateSetter<boolean>;
  setBottomPanelTab: StateSetter<BottomPanelTab>;
  setBottomPanelOpen: StateSetter<boolean>;
}

export function useSettingsWindowSync({
  settings,
  settingsContribution,
  handleSettingsPreview,
  setLayout,
  setSettings,
  setLanguageToolsOpen,
  setBottomPanelTab,
  setBottomPanelOpen,
}: SettingsWindowSyncOptions) {
  const handleOpenSettingsTab = useCallback(() => {
    // Settings opens either as an editor tab or as the dedicated window, per
    // editor.openSettingsIn. The contribution gate keeps both honest: if the
    // Settings extension is ever disabled or its manifest stops declaring the
    // view, the command degrades to a no-op instead of leaking a direct import
    // into the pane or opening a window whose extension surface is absent.
    if (!settingsContribution) return;
    if (settings.editor.openSettingsIn === "window") {
      void window.axon.openSettingsWindow();
      return;
    }
    setLayout((prev) =>
      openFileInPane(prev, prev.activePaneId, AXON_SETTINGS_TAB_PATH),
    );
  }, [settings.editor.openSettingsIn, settingsContribution, setLayout]);
  useEffect(() => {
    // The dedicated settings window previews drafts without saving and relays
    // them here, so every editor window mirrors the live theme while the user
    // drags sliders in the settings window. Save convergence and the
    // Language Tools / LSP Logs relays travel the same broadcast channels.
    const unsubscribePreview = window.axon.onSettingsPreview((nextSettings) => {
      handleSettingsPreview(nextSettings);
    });
    const unsubscribeChanged = window.axon.onSettingsChanged((nextSettings) => {
      setSettings(normalizeSettings(nextSettings));
    });
    const unsubscribeAction = window.axon.onSettingsAction((action) => {
      if (action === "openLanguageTools") {
        setLanguageToolsOpen(true);
        return;
      }
      setBottomPanelTab("output");
      setBottomPanelOpen(true);
    });

    return () => {
      unsubscribePreview();
      unsubscribeChanged();
      unsubscribeAction();
    };
  }, [
    handleSettingsPreview,
    setBottomPanelOpen,
    setBottomPanelTab,
    setLanguageToolsOpen,
    setSettings,
  ]);

  return { handleOpenSettingsTab };
}