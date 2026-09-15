/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Full-screen settings surface used by the dedicated Settings window. It is a
// self-contained mount that mirrors what AxonApp's useAppDerivedState does for
// the editor shell - resolve theme tokens, apply CSS variables, and sync native
// glass - but only for the SettingsTab, so the settings window never boots
// Monaco or the editor services. Preview applies locally AND broadcasts to the
// editor windows through the main process, while save delegates the disk write
// (and the settings:changed convergence broadcast) to main.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { normalizeSettings, type AxonSettings } from "@axon-editor/shared/settings";
import { getEnabledExtensionThemes } from "@axon-editor/shared/extensions";
import type { ExtensionState } from "@axon-editor/shared/extensions";
import {
  createThemeCssVariables,
  resolveThemeTokens,
} from "@axon-editor/renderer/shared/lib/themeTokens";
import { resolveActiveTheme } from "@axon-editor/renderer/shared/themes/tokenThemes";
import SettingsTab from "@axon-builtin-settings/settings/SettingsTab";
import { createGlassThemeCssVariables } from "../../workbench/app/lib/glassTheme";

export default function SettingsSurfaceRoot() {
  const [settings, setSettings] = useState<AxonSettings | null>(null);
  const [extensionState, setExtensionState] = useState<ExtensionState | null>(
    null,
  );
  const [availableFonts, setAvailableFonts] = useState<
    AxonSettings["customFonts"]
  >([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      window.axon.getSettings(null),
      window.axon.listAvailableFonts(),
      window.axon.listExtensions(null),
    ])
      .then(([loadedSettings, fonts, listedExtensions]) => {
        if (cancelled) return;
        setSettings(normalizeSettings(loadedSettings));
        setAvailableFonts(fonts);
        setExtensionState(listedExtensions);
      })
      .catch((error) => {
        console.error("failed to load settings surface:", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const extensionThemes = useMemo(
    () => getEnabledExtensionThemes(extensionState),
    [extensionState],
  );

  const appThemeCssVariables = useMemo(() => {
    if (!settings) return null;
    const activeTheme = resolveActiveTheme(settings.editor.themeId, extensionThemes);
    const themeTokens = resolveThemeTokens(settings, extensionThemes);
    const themeCssVariables = createThemeCssVariables(
      themeTokens,
      activeTheme.appearance,
    );
    if (settings.editor.appGlassMode === "off") return themeCssVariables;

    return createGlassThemeCssVariables(
      themeCssVariables,
      themeTokens,
      activeTheme.appearance,
      settings.editor.appBackgroundOpacity,
      settings.editor.appBackgroundBlur,
    );
  }, [extensionThemes, settings]);

  useEffect(() => {
    if (!settings || !appThemeCssVariables) return;

    const glassActive = settings.editor.appGlassMode !== "off";
    document.documentElement.classList.toggle("axon-native-glass", glassActive);
    const variableMap = appThemeCssVariables as CSSProperties & {
      [customProperty: `--${string}`]: string | number | undefined;
    };
    void window.axon
      .setWindowGlass(
        settings.editor.appGlassMode,
        (variableMap["--axon-background"] ?? "") as string,
        appThemeCssVariables.colorScheme as "dark" | "light",
      )
      .catch((error) => {
        console.warn("failed to synchronize native window glass:", error);
      });

    const roots = [document.documentElement, document.body];
    const variableEntries = Object.entries(appThemeCssVariables).filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith("--axon-") && typeof entry[1] === "string",
    );
    roots.forEach((root) => {
      variableEntries.forEach(([name, value]) => {
        root.style.setProperty(name, value);
      });
    });

    return () => {
      roots.forEach((root) => {
        variableEntries.forEach(([name]) => {
          root.style.removeProperty(name);
        });
      });
    };
  }, [appThemeCssVariables, settings]);

  // These two identities must stay stable for SettingsTab's effects to behave:
  // the preview and auto-save debounce timers depend on them, and a new arrow
  // on every render makes each setSettings re-render cancel and re-arm the
  // debounce (and re-fire the preview timer), so the window would keep painting
  // "Saving settings..." while the save never happens. setSettings is the only
  // mutable dependency and its identity is stable.
  const onPreview = useCallback(
    (nextSettings: AxonSettings) => {
      setSettings(normalizeSettings(nextSettings));
      void window.axon.previewSettings!(nextSettings);
    },
    [setSettings],
  );
  const onSave = useCallback(
    (nextSettings: AxonSettings) => {
      return window.axon.updateSettings(nextSettings, null).then((saved) => {
        // Main is the disk authority and broadcasts settings:changed to the
        // editor windows; this window converges to the returned value so
        // the "saved" state reflects exactly what was written.
        setSettings(normalizeSettings(saved));
        return true;
      });
    },
    [setSettings],
  );

  if (!settings || !extensionState) {
    return (
      <div className="flex h-screen w-full min-h-0 flex-col overflow-hidden">
        <div
          className="flex h-9 shrink-0 items-center border-b border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)]"
          style={{ WebkitAppRegion: "drag" } as CSSProperties}
          aria-hidden="true"
        />
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--axon-editor-background)] text-[var(--axon-editor-foreground)]">
          Loading settings...
        </div>
      </div>
    );
  }

  // The settings window keeps a full-width drag strip across its top because
  // the static settings.html strip only lives until React mounts. Without this
  // region, the hidden-inset titlebar leaves the window immovable (and the
  // macOS traffic lights / Windows caption overlay, which both own the top
  // 36px, overlap whatever widget sits there). Rendering it in the loading
  // branch too keeps the window draggable for the whole startup.
  return (
    <div className="flex h-screen w-full min-h-0 flex-col overflow-hidden">
      <div
        className="flex h-9 shrink-0 items-center border-b border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)]"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
        aria-hidden="true"
      />
      <div className="min-h-0 flex-1">
        <SettingsTab
        folderPath={null}
        language="plaintext"
        availableFonts={availableFonts}
        extensionState={extensionState}
        settings={settings}
        onCloseTab={() => {
          void window.axon.closeSettingsWindow!();
        }}
        onPreview={onPreview}
        onSave={onSave}
        onOpenLanguageTools={() => {
          void window.axon.sendSettingsAction!("openLanguageTools");
        }}
        onViewLogs={() => {
          void window.axon.sendSettingsAction!("viewLogs");
        }}
        />
      </div>
    </div>
  );
}