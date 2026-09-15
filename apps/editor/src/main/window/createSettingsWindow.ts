/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The separate Settings window is the opt-in surface for editor.openSettingsIn.
// Every editor window shares one Settings window: OPEN_SETTINGS focuses the
// existing window instead of spawning a second copy, exactly like Zed reusing
// its settings window across all project windows. All window-to-editor chatter
// (live preview, save convergence, Language Tools / logs relays) is broadcast
// from here so editor WebContents never need to know which window is the
// settings surface.

import { BrowserWindow, shell } from "electron";
import path from "path";
import { readBootAppearance } from "../settings/bootAppearance";
import {
  applyWindowGlass,
  getWindowGlassBackground,
  getWindowGlassConstructorOptions,
} from "./windowGlass";

interface SettingsWindowDependencies {
  axonDevServerUrl: string;
  isDev: boolean;
  isMac: boolean;
  isWindows: boolean;
  getAxonIconPath: () => string;
}

function isExternalHandlerUrl(href: string) {
  return /^(https?:|mailto:|tel:)/i.test(href);
}

function routeExternalNavigation(window: BrowserWindow) {
  // The settings window only renders the settings tab, but its Markdown-ish
  // descriptions and imported-font previews could still attempt navigation.
  // Denying window.open and will-navigate keeps it a single pane while sending
  // web/mail/phone links to the user's system apps, mirroring the editor shell.
  window.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (isExternalHandlerUrl(targetUrl)) {
      void shell.openExternal(targetUrl);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (!targetUrl || targetUrl === window.webContents.getURL()) return;
    event.preventDefault();
    if (isExternalHandlerUrl(targetUrl)) {
      void shell.openExternal(targetUrl);
    }
  });
}

const SETTINGS_WINDOW_SURFACE = "settings";

export function createSettingsWindow(deps: SettingsWindowDependencies) {
  let settingsWindow: BrowserWindow | null = null;

  // The module-level surface marker is how every broadcast helper tells the
  // dedicated settings surface apart from editor windows, so preview/save
  // events never loop back into the window that produced them.
  function markSettingsSurface(window: BrowserWindow) {
    (window as BrowserWindow & { axonSurface?: string }).axonSurface =
      SETTINGS_WINDOW_SURFACE;
  }

  function openSettingsWindow() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      if (settingsWindow.isMinimized()) settingsWindow.restore();
      settingsWindow.focus();
      return settingsWindow;
    }

    const bootAppearance = readBootAppearance();
    settingsWindow = new BrowserWindow({
      // Settings stays a normal resizable window (with a sane minimum so the
      // 240px sidebar and the section pane never collapse into unusable bands).
      width: 1080,
      height: 720,
      minWidth: 800,
      minHeight: 240,
      title: "Axon - Settings",
      // Traffic lights sit where the native hidden-inset titlebar places them
      // in the editor shell, but slightly inset like Zed's settings window so
      // the narrow pane does not feel cramped.
      titleBarStyle: deps.isMac ? "hiddenInset" : "hidden",
      trafficLightPosition: deps.isMac ? { x: 12, y: 12 } : undefined,
      titleBarOverlay: deps.isWindows
        ? {
            color: bootAppearance.background,
            symbolColor: "#9aa4b8",
            height: 36,
          }
        : undefined,
      ...getWindowGlassConstructorOptions(bootAppearance.glassMode),
      transparent: false,
      backgroundColor: getWindowGlassBackground(
        bootAppearance.glassMode,
        bootAppearance.background,
      ),
      icon: deps.getAxonIconPath(),
      // The settings surface deliberately loads a narrowed preload. Settings
      // only needs the settings, theme, font, and model-scoped bridges - never
      // the privileged core/fs/LSP file surface - so an exploit in the settings
      // renderer has the smallest possible window.axon to reach for.
      webPreferences: {
        preload: path.join(__dirname, "../../preload/settings.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    markSettingsSurface(settingsWindow);

    applyWindowGlass(
      settingsWindow,
      bootAppearance.glassMode,
      bootAppearance.background,
      bootAppearance.appearance,
    );

    const bootAppearanceQuery = {
      axonBootAppearance: bootAppearance.appearance,
      axonBootBackground: bootAppearance.background,
      axonBootForeground: bootAppearance.foreground,
      axonBootAccent: bootAppearance.accent,
    };

    routeExternalNavigation(settingsWindow);

    if (deps.isDev) {
      const rendererUrl = new URL(deps.axonDevServerUrl);
      // The settings surface is its own Vite entry (src/renderer/settings.tsx)
      // with no editor boot, so the window loads settings.html, not index.html.
      rendererUrl.pathname = "/settings.html";
      Object.entries(bootAppearanceQuery).forEach(([key, value]) => {
        rendererUrl.searchParams.set(key, value);
      });
      settingsWindow.loadURL(rendererUrl.toString());
    } else {
      settingsWindow.loadFile(path.join(__dirname, "../../renderer/settings.html"), {
        query: bootAppearanceQuery,
      });
    }

    settingsWindow.on("closed", () => {
      // Keeping the module reference null after close lets a later OPEN_SETTINGS
      // create a fresh window instead of focusing a destroyed shell.
      settingsWindow = null;
    });

    return settingsWindow;
  }

  function closeSettingsWindow() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
  }

  function isSettingsWindow(window: BrowserWindow) {
    return (
      (window as BrowserWindow & { axonSurface?: string }).axonSurface ===
      SETTINGS_WINDOW_SURFACE
    );
  }

  // The only channel a settings window can reach editor windows through. The
  // exceptRendererId parameter keeps save/preview events from echoing back to
  // their origin when the origin is an editor tab running the same broadcast.
  function broadcastSettingsToEditorWindows(
    channel: string,
    payload?: unknown,
    exceptRendererId?: number,
  ) {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) continue;
      if (isSettingsWindow(window)) continue;
      if (exceptRendererId !== undefined) {
        if (window.webContents.id === exceptRendererId) continue;
      }
      if (window.webContents.isDestroyed()) continue;
      try {
        window.webContents.send(channel, payload);
      } catch {
        // Electron can destroy a WebContents between the guard and the send
        // during quit/update. A dropped settings notification is never worth
        // crashing the main process over.
      }
    }
  }

  return {
    openSettingsWindow,
    closeSettingsWindow,
    isSettingsWindow,
    broadcastSettingsToEditorWindows,
  };
}