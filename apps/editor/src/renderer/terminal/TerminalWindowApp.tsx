/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Full-screen surface for the floating Terminal window. It is a self-contained
// mount that mirrors SettingsSurfaceRoot's theme/glass sync so the window
// matches the editor chrome, then delegates the actual PTY rendering to the
// terminal extension surface running in windowed mode. The adopted session
// snapshot arrives from main over IPC; nothing about shell state is stored here
// beyond the handoff that seeded the surface.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { normalizeSettings, type AxonSettings } from "@axon-editor/shared/core/settings";
import { getEnabledExtensionThemes } from "@axon-editor/shared/extensions/extensions";
import type { ExtensionState } from "@axon-editor/shared/extensions/extensions";
import {
  createThemeCssVariables,
  resolveThemeTokens,
} from "@axon-editor/renderer/shared/lib/theme/themeTokens";
import { resolveActiveTheme } from "@axon-editor/renderer/shared/themes/syntax/tokenThemes";
import Terminal from "@axon-builtin-terminal/Terminal";
import { resolveTerminalWorkbenchContribution } from "@axon-builtin-terminal/lib/contribution";
import {
  type TerminalSurfaceDockMode,
  type TerminalWindowHandoff,
} from "@axon-editor/shared/terminal/terminalWindow";
import { createGlassThemeCssVariables } from "../../workbench/app/lib/glass/glassTheme";

export default function TerminalWindowApp() {
  const workspaceRoot = useMemo(() => {
    const root = new URLSearchParams(window.location.search).get(
      "axonWorkspaceRoot",
    );
    return root && root.length > 0 ? root : null;
  }, []);
  const [handoff, setHandoff] = useState<TerminalWindowHandoff | null>(null);
  const [settings, setSettings] = useState<AxonSettings | null>(null);
  const [extensionState, setExtensionState] = useState<ExtensionState | null>(
    null,
  );
  const serializeGetterRef = useRef<() => TerminalWindowHandoff | null>(
    () => null,
  );

  const nativeControlInset = useMemo(() => {
    if (window.axon.platform === "darwin") return { start: 80, end: 0 };
    return { start: 0, end: 150 };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // The handoff is pulled rather than pushed because main delivers adopt on
    // did-finish-load, which races the React tree. A pull also covers reloads.
    void window.axon
      .getTerminalWindowHandoff!()
      .then((startingHandoff) => {
        if (cancelled || !startingHandoff) return;
        setHandoff(startingHandoff);
      })
      .catch((error) => {
        console.error("failed to adopt terminal window handoff:", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      window.axon.getSettings(workspaceRoot),
      window.axon.listExtensions(workspaceRoot),
    ])
      .then(([loadedSettings, listedExtensions]) => {
        if (cancelled) return;
        setSettings(normalizeSettings(loadedSettings));
        setExtensionState(listedExtensions);
      })
      .catch((error) => {
        console.error("failed to load terminal window context:", error);
      });
    // Main relays every editor's live preview and save convergence here. The
    // theme and terminal fields are global settings, so adopting the merged
    // payload keeps the window consistent without a folder-dependent refetch.
    const offPreview = window.axon.onSettingsPreview((preview) => {
      setSettings(normalizeSettings(preview));
    });
    const offChanged = window.axon.onSettingsChanged((changed) => {
      setSettings(normalizeSettings(changed));
    });
    return () => {
      cancelled = true;
      offPreview();
      offChanged();
    };
  }, [workspaceRoot]);

  const extensionThemes = useMemo(
    () => getEnabledExtensionThemes(extensionState),
    [extensionState],
  );

  const activeTheme = useMemo(
    () =>
      settings
        ? resolveActiveTheme(settings.editor.themeId, extensionThemes)
        : null,
    [extensionThemes, settings],
  );
  const themeTokens = useMemo(
    () =>
      settings ? resolveThemeTokens(settings, extensionThemes) : null,
    [extensionThemes, settings],
  );
  const terminalColors = useMemo(
    () =>
      activeTheme
        ? { ...activeTheme.monaco, ...activeTheme.terminal }
        : {},
    [activeTheme],
  );

  const appThemeCssVariables = useMemo(() => {
    if (!settings || !activeTheme || !themeTokens) return null;
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
  }, [activeTheme, settings, themeTokens]);

  useEffect(() => {
    if (!settings || !activeTheme || !themeTokens || !appThemeCssVariables) {
      return;
    }

    const glassActive = settings.editor.appGlassMode !== "off";
    document.documentElement.classList.toggle("axon-native-glass", glassActive);

    void window.axon
      .setWindowGlass(
        settings.editor.appGlassMode,
        themeTokens.background,
        activeTheme.appearance,
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
  }, [activeTheme, appThemeCssVariables, settings, themeTokens]);

  const dockWindow = useCallback((dockMode: TerminalSurfaceDockMode) => {
    // The snapshot is sourced from the mounted Terminal surface so the session
    // manager serializes its authoritative live state (tabs, active selection,
    // replies). This ref is populated once the surface registers its getter.
    const current = serializeGetterRef.current();
    if (!current) return;
    void window.axon.dockTerminalWindow!({ ...current, dockMode });
  }, []);

  const handleDock = useCallback(() => dockWindow("show"), [dockWindow]);
  const handleHide = useCallback(() => dockWindow("hide"), [dockWindow]);

  useEffect(() => {
    // The OS close button and Cmd+W reach main first. Main pauses the close and
    // asks for the live snapshot so a tab born in this window survives the
    // handoff back to the editor instead of being orphaned.
    const offRequest = window.axon.onTerminalDockRequest!(() => {
      handleDock();
    });
    return offRequest;
  }, [handleDock]);

  const contribution = useMemo(
    () => resolveTerminalWorkbenchContribution(extensionState),
    [extensionState],
  );

  const handleSurfaceState = useCallback(
    (getState: () => TerminalWindowHandoff | null) => {
      serializeGetterRef.current = getState;
    },
    [],
  );

  if (!settings || !extensionState || !contribution || !handoff || !themeTokens) {
    return (
      <div
        className="flex h-screen w-full flex-col overflow-hidden"
        style={{
          background: "var(--axon-boot-background)",
          color: "var(--axon-boot-foreground)",
        }}
      >
        <div
          className="flex h-9 shrink-0 items-center border-b border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)]"
          style={{ WebkitAppRegion: "drag" } as CSSProperties}
          aria-hidden="true"
        />
        <div className="flex min-h-0 flex-1 items-center justify-center text-[12px] opacity-70">
          Loading terminal...
        </div>
      </div>
    );
  }

  // The window surface owns the OS chrome: closing the last tab leaves an
  // empty terminal with its + button instead of hiding the window, and a
  // hidden panel is irrelevant while the window itself is the panel's
  // full-screen projection.
  return (
    <div className="flex h-screen w-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        <Terminal
          open
          createNonce={handoff.createNonce}
          createWorkingDirectory={handoff.workspaceRoot}
          editorSettings={settings.editor}
          terminalSettings={settings.terminal}
          terminalColors={terminalColors}
          themeTokens={themeTokens}
          workingDirectory={handoff.workspaceRoot}
          activePanelTab="terminal"
          outputEntries={[]}
          contribution={contribution}
          onActivePanelTabChange={() => {}}
          onClearOutput={() => {}}
          onHide={() => {}}
          windowed
          adoptHandoff={handoff}
          onWindowDock={handleDock}
          onWindowHide={handleHide}
          onWindowStateRef={handleSurfaceState}
          nativeControlInset={nativeControlInset}
        />
      </div>
    </div>
  );
}