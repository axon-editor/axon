/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The dedicated terminal window is owned per editor window. The editor parks
// its live sessions (close websocket, suppress reconnect) before opening it,
// and the window hands its snapshot back before closing. Main sits between the
// two renderers: it holds the handoff the window adopted, grants the workspace
// capability the window's narrow preload needs to ticket PTYs and read
// settings, and coordinates the close handshake so sessions born in the window
// survive the move back instead of being orphaned.
//
// Window close is intercepted, never let through: a plain close would let the
// renderer tear down its sessions (terminating the PTYs the editor is about to
// adopt). Main asks for the live snapshot, waits a short beat, and force-
// destroys the window, which bypasses the close event and the renderer's
// session cleanup entirely. The editor reconnects with its own byte offset, so
// only the output produced while floating replays into an untouched buffer.

import { app, BrowserWindow, ipcMain, shell, webContents } from "electron";
import path from "path";
import { readBootAppearance } from "../settings/bootAppearance";
import {
  applyWindowGlass,
  getWindowGlassBackground,
  getWindowGlassConstructorOptions,
} from "../window/windowGlass";
import {
  TERMINAL_WINDOW_SURFACE,
  TERMINAL_WINDOW_TITLE,
  type TerminalSurfaceDockMode,
  type TerminalWindowHandoff,
} from "../../shared/terminalWindow";
import { type WorkspaceCapabilityRegistry } from "../security/workspaceCapabilities";

interface TerminalWindowDependencies {
  axonDevServerUrl: string;
  isDev: boolean;
  isMac: boolean;
  isWindows: boolean;
  getAxonIconPath: () => string;
  workspaceCapabilities: WorkspaceCapabilityRegistry;
}

const TERMINAL_WINDOW_WIDTH = 980;
const TERMINAL_WINDOW_HEIGHT = 620;
const TERMINAL_WINDOW_MIN_WIDTH = 520;
const TERMINAL_WINDOW_MIN_HEIGHT = 320;

// The renderer needs a beat to serialize its live snapshot from the mounted
// xterm state before the window is torn down. Too short and the fallback wins
// with a stale handoff; too long and closing the window feels stuck for the
// exchange.
const DOCK_FALLBACK_TIMEOUT_MS = 700;

function isExternalHandlerUrl(href: string) {
  return /^(https?:|mailto:|tel:)/i.test(href);
}

function isTerminalWindow(window: BrowserWindow) {
  return (
    (window as BrowserWindow & { axonSurface?: string }).axonSurface ===
    TERMINAL_WINDOW_SURFACE
  );
}

interface TerminalWindowEntry {
  window: BrowserWindow;
  windowRendererId: number;
  ownerRendererId: number;
  handoff: TerminalWindowHandoff | null;
  pendingDockMode: TerminalSurfaceDockMode | null;
  closeRequested: boolean;
  docked: boolean;
  fallbackTimer: NodeJS.Timeout | null;
}

function routeExternalNavigation(window: BrowserWindow) {
  // The terminal surface only renders live PTY panes, but its xterm link
  // handler and any accidental in-page navigation should still end up in the
  // system browser, mirroring the editor shell's navigation policy.
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

export function createTerminalWindowController(
  deps: TerminalWindowDependencies,
) {
  const entries = new Map<number, TerminalWindowEntry>();
  const windowRendererToOwner = new Map<number, number>();
  const ownerToWindowRenderer = new Map<number, number>();
  let appIsQuitting = false;

  app.on("before-quit", () => {
    // During quit the dock handshake would fight the shutdown (and the editor
    // adopting sessions back from a dead app is pointless), so close is
    // allowed to proceed normally once the app is leaving.
    appIsQuitting = true;
  });

  function emitDocked(ownerRendererId: number, handoff: TerminalWindowHandoff | null) {
    const owner = webContents.fromId(ownerRendererId);
    if (!owner || owner.isDestroyed()) return;
    owner.send("terminal:docked", handoff);
  }

  function cleanupEntry(entry: TerminalWindowEntry) {
    if (entry.fallbackTimer) {
      clearTimeout(entry.fallbackTimer);
      entry.fallbackTimer = null;
    }
    entries.delete(entry.windowRendererId);
    windowRendererToOwner.delete(entry.windowRendererId);
    if (ownerToWindowRenderer.get(entry.ownerRendererId) === entry.windowRendererId) {
      ownerToWindowRenderer.delete(entry.ownerRendererId);
    }
    deps.workspaceCapabilities.releaseRenderer(entry.windowRendererId);
  }

  function finalizeDock(entry: TerminalWindowEntry, handoff: TerminalWindowHandoff | null, notifyOwner = true) {
    if (entry.docked) return;
    entry.docked = true;

    const ownerRendererId = entry.ownerRendererId;

    // The editor's chosen action (dock vs hide) travels in pendingDockMode, set
    // before the window close started. The OS close button leaves it null and
    // falls back to the handoff's own mode, which the renderer passes through.
    const dockMode = entry.pendingDockMode ?? handoff?.dockMode ?? "show";
    const finalHandoff = handoff ? { ...handoff, dockMode } : handoff;
    entry.handoff = finalHandoff;

    // destroy() bypasses the close event entirely, so the renderer never runs
    // its session teardown: the PTYs stay alive for the editor to reconnect to.
    if (!entry.window.isDestroyed()) {
      entry.window.destroy();
    }
    cleanupEntry(entry);
    if (notifyOwner) {
      emitDocked(ownerRendererId, finalHandoff);
    }
  }

  function handleWindowClose(entry: TerminalWindowEntry, event: Electron.Event) {
    if (appIsQuitting) return;
    event.preventDefault();
    if (entry.closeRequested) return;
    entry.closeRequested = true;

    if (!entry.window.isDestroyed()) {
      entry.window.webContents.send("terminal:dockRequest");
    }
    entry.fallbackTimer = setTimeout(() => {
      finalizeDock(entry, entry.handoff);
    }, DOCK_FALLBACK_TIMEOUT_MS);
  }

  function openTerminalWindow(ownerRendererId: number, handoff: TerminalWindowHandoff) {
    const existingWindowRendererId = ownerToWindowRenderer.get(ownerRendererId);
    const existingEntry =
      existingWindowRendererId === undefined
        ? undefined
        : entries.get(existingWindowRendererId);
    if (existingEntry && !existingEntry.window.isDestroyed()) {
      if (existingEntry.window.isMinimized()) existingEntry.window.restore();
      existingEntry.window.focus();
      return;
    }

    const bootAppearance = readBootAppearance();
    const terminalWindow = new BrowserWindow({
      width: TERMINAL_WINDOW_WIDTH,
      height: TERMINAL_WINDOW_HEIGHT,
      minWidth: TERMINAL_WINDOW_MIN_WIDTH,
      minHeight: TERMINAL_WINDOW_MIN_HEIGHT,
      title: TERMINAL_WINDOW_TITLE,
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
      // The terminal surface loads a narrowed preload (no core/fs/LSP file
      // surface) so an exploit in the window has the smallest possible API,
      // matching the settings window's compromise.
      webPreferences: {
        preload: path.join(__dirname, "../../preload/terminal.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });

    (terminalWindow as BrowserWindow & { axonSurface?: string }).axonSurface =
      TERMINAL_WINDOW_SURFACE;

    applyWindowGlass(
      terminalWindow,
      bootAppearance.glassMode,
      bootAppearance.background,
      bootAppearance.appearance,
    );
    routeExternalNavigation(terminalWindow);

    const windowRendererId = terminalWindow.webContents.id;
    const entry: TerminalWindowEntry = {
      window: terminalWindow,
      windowRendererId,
      ownerRendererId,
      handoff,
      pendingDockMode: null,
      closeRequested: false,
      docked: false,
      fallbackTimer: null,
    };
    entries.set(windowRendererId, entry);
    windowRendererToOwner.set(windowRendererId, ownerRendererId);
    ownerToWindowRenderer.set(ownerRendererId, windowRendererId);

    // Granted before any URL loads: settings:get, extensions:list, and
    // core:createTerminalTicket all assert the sender holds a capability for
    // the workspace root, and the narrow preload cannot re-authorize on its
    // own. A missing or vanished folder just skips the grant; the window still
    // opens and shows its error states.
    if (handoff.workspaceRoot) {
      try {
        deps.workspaceCapabilities.authorize(
          windowRendererId,
          handoff.workspaceRoot,
        );
      } catch (error) {
        console.warn(
          "terminal window: failed to grant workspace capability:",
          error,
        );
      }
    }

    terminalWindow.on("close", (event) => handleWindowClose(entry, event));
    terminalWindow.on("closed", () => cleanupEntry(entry));

    if (deps.isDev) {
      const rendererUrl = new URL(deps.axonDevServerUrl);
      rendererUrl.pathname = "/terminal.html";
      rendererUrl.searchParams.set(
        "axonWorkspaceRoot",
        handoff.workspaceRoot ?? "",
      );
      void terminalWindow.loadURL(rendererUrl.toString());
    } else {
      void terminalWindow.loadFile(
        path.join(__dirname, "../../renderer/terminal.html"),
        { query: { axonWorkspaceRoot: handoff.workspaceRoot ?? "" } },
      );
    }
  }

  function requestWindowClose(ownerRendererId: number, dockMode: TerminalSurfaceDockMode) {
    const windowRendererId = ownerToWindowRenderer.get(ownerRendererId);
    const entry =
      windowRendererId === undefined ? undefined : entries.get(windowRendererId);
    if (!entry) {
      // The editor believed it was floating but the window is already gone. A
      // null handoff tells it to resume its own parked tabs.
      emitDocked(ownerRendererId, null);
      return;
    }
    entry.pendingDockMode = dockMode;
    if (!entry.closeRequested) {
      entry.window.close();
    }
  }

  function ownerClosed(ownerRendererId: number) {
    const windowRendererId = ownerToWindowRenderer.get(ownerRendererId);
    const entry =
      windowRendererId === undefined ? undefined : entries.get(windowRendererId);
    if (!entry) return;
    // The owner is gone, so there is no editor to hand sessions back to. Mark
    // the entry docked to suppress emission and let the close handler alone.
    entry.docked = true;
    if (!entry.window.isDestroyed()) {
      entry.window.destroy();
    }
    cleanupEntry(entry);
  }

  ipcMain.handle(
    "terminal:openWindow",
    (event, handoff: TerminalWindowHandoff) => {
      openTerminalWindow(event.sender.id, handoff);
    },
  );

  ipcMain.handle(
    "terminal:closeWindow",
    (event, dockMode: TerminalSurfaceDockMode) => {
      requestWindowClose(event.sender.id, dockMode);
    },
  );

  ipcMain.handle("terminal:dock", (event, handoff: TerminalWindowHandoff) => {
    const entry = entries.get(event.sender.id);
    if (entry) {
      finalizeDock(entry, handoff);
    }
  });

  ipcMain.handle("terminal:getHandoff", (event) => {
    return entries.get(event.sender.id)?.handoff ?? null;
  });

  return { ownerClosed, isTerminalWindow };
}