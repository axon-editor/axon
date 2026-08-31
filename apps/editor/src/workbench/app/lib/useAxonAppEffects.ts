import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  addRecentFolder,
  getWorkspaceTrustState,
} from "../../../renderer/features/sidebar";
import {
  clearLanguageServerDiagnosticsFromMonaco,
  collectEditorDiagnostics,
  onEditorDiagnosticsChanged,
  syncLanguageServerDiagnosticsToMonaco,
  type EditorDiagnostic,
} from "@axon-builtin-problems/lib/diagnostics";
import { updateLspDiagnosticCache } from "@axon-builtin-problems/lib/diagnosticCache";
import {
  detectLanguageServerLanguage,
  getModel,
  updateModel,
} from "../../../renderer/features/editor/lib/buffer/monacoModels";
import { useGlobalEditorShortcuts } from "../../../renderer/features/editor/shortcuts/useGlobalEditorShortcuts";
import {
  getTree,
  readFile,
  type FileNode,
} from "../../../renderer/shared/lib/api";
import { createBundledFontFaces } from "../../../renderer/shared/lib/bundledFonts";
import {
  markAxonPerformance,
  measureAxonPerformance,
} from "../../../renderer/shared/lib/performanceMarks";
import { registerAxonTheme } from "../../../renderer/shared/lib/soraTheme";
import {
  loadWorkspaceSession,
  saveWorkspaceSession,
} from "../../../renderer/shared/lib/workspaceSession";
import {
  normalizeSettings,
  type AxonSettings,
  type CustomFont,
  type ThemeId,
} from "../../../shared/settings";
import * as monaco from "monaco-editor";
import { escapeCssString } from "./appPath";
import type { EditorNavigationTarget } from "../../../renderer/features/editor/lib/layout/navigation";
import {
  folderChanges,
  shouldReloadWorkspaceRoot,
} from "../../../renderer/features/sidebar/files/lib/treeRefresh";
import { type WorkspaceRoot } from "../../../renderer/shared/lib/workspaceRoots";
import { type Pane, type Layout } from "../../../renderer/features/editor/lib/layout/types";
import { type AgentResumeRequest } from "../../../shared/app";
import { type GitStatusResult } from "../../../shared/git";
import { type ResolvedExtensionTheme } from "../../../shared/extensions";
import { type UpdateInfo, type UpdateInstallState } from "../../../shared/updates";
import { type BottomPanelTab, type OutputEntryLevel } from "../../../platform/panel/bottomPanel";
import { type ResolvedThemeTokens } from "../../../renderer/shared/lib/themeTokens";
import { type AxonCommand } from "../../../shared/commands";
import { type LspDiagnosticsByFile } from "@axon-builtin-problems/lib/diagnosticCache";
import { type useWorkspaceHandlers } from "./useWorkspaceHandlers";

type StateSetter<T> = Dispatch<SetStateAction<T>>;
type AppendOutput = (
  source: string,
  message: string,
  level?: OutputEntryLevel,
) => void;
type WorkspaceHandlers = ReturnType<typeof useWorkspaceHandlers>;

interface AxonAppEffectsOptions {
  activeLanguageServerStartRef: MutableRefObject<Set<string>>;
  activePane: Pane | undefined;
  activeRootId: string | null;
  activeThemeId: ThemeId;
  allowSessionPersistenceRef: MutableRefObject<boolean>;
  appendOutput: AppendOutput;
  availableFonts: CustomFont[];
  bottomPanelOpen: boolean;
  bottomPanelTab: BottomPanelTab;
  extensionThemes: ResolvedExtensionTheme[];
  folderPath: string | null;
  gitStatus: GitStatusResult | null;
  folderRefreshRequestRef: MutableRefObject<number>;
  folderRefreshTimerRef: MutableRefObject<number | null>;
  handleFolderChange: WorkspaceHandlers["handleFolderChange"];
  handleOpenNavigationTarget: (
    target: Omit<EditorNavigationTarget, "id">,
  ) => void;
  handleSettingsSave: (
    settings: AxonSettings,
    options?: { announce?: boolean },
  ) => Promise<boolean>;
  layout: Layout;
  lspDiagnosticsByFile: LspDiagnosticsByFile;
  refreshGitStatus: (options?: { silent?: boolean }) => Promise<void>;
  refreshProjectDiagnostics: () => Promise<void>;
  restoreStartedRef: MutableRefObject<boolean>;
  runCommand: (command: AxonCommand) => void;
  sessionReady: boolean;
  settings: AxonSettings;
  settingsJsonPath: string | null;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  setAgentResumeRequest: StateSetter<AgentResumeRequest | null>;
  setAgentResumeRequested: StateSetter<boolean>;
  setAgentSidebarOpen: StateSetter<boolean>;
  setAvailableFonts: StateSetter<CustomFont[]>;
  setExtensionsOpen: StateSetter<boolean>;
  setLoading: StateSetter<boolean>;
  setLspDiagnosticsByFile: StateSetter<LspDiagnosticsByFile>;
  setMonacoDiagnostics: StateSetter<EditorDiagnostic[]>;
  setProjectDiagnostics: StateSetter<EditorDiagnostic[]>;
  setSessionReady: StateSetter<boolean>;
  setSettings: StateSetter<AxonSettings>;
  setSettingsHydrated: StateSetter<boolean>;
  setTaskRunnerOpen: StateSetter<boolean>;
  setTerminalOpen: StateSetter<boolean>;
  setTree: StateSetter<FileNode | null>;
  setUpdateInfo: StateSetter<UpdateInfo | null>;
  setUpdateInstallState: StateSetter<UpdateInstallState>;
  setWorkspaceRoots: StateSetter<WorkspaceRoot[]>;
  setZenMode: StateSetter<boolean>;
  terminalOpen: boolean;
  themeTokens: ResolvedThemeTokens;
  workspaceRoots: WorkspaceRoot[];
  workspaceTrusted: boolean;
  workspaceTrustNonce: number;
  zenMode: boolean;
}

export function useAxonAppEffects({
  activeLanguageServerStartRef,
  activePane,
  activeRootId,
  activeThemeId,
  allowSessionPersistenceRef,
  appendOutput,
  availableFonts,
  bottomPanelOpen,
  bottomPanelTab,
  extensionThemes,
  folderPath,
  gitStatus,
  folderRefreshRequestRef,
  folderRefreshTimerRef,
  handleFolderChange,
  handleOpenNavigationTarget,
  handleSettingsSave,
  layout,
  lspDiagnosticsByFile,
  refreshGitStatus,
  refreshProjectDiagnostics,
  restoreStartedRef,
  runCommand,
  sessionReady,
  settings,
  settingsJsonPath,
  sidebarCollapsed,
  sidebarWidth,
  setAgentResumeRequest,
  setAgentResumeRequested,
  setAgentSidebarOpen,
  setAvailableFonts,
  setExtensionsOpen,
  setLoading,
  setLspDiagnosticsByFile,
  setMonacoDiagnostics,
  setProjectDiagnostics,
  setSessionReady,
  setSettings,
  setSettingsHydrated,
  setTaskRunnerOpen,
  setTerminalOpen,
  setTree,
  setUpdateInfo,
  setUpdateInstallState,
  setWorkspaceRoots,
  setZenMode,
  terminalOpen,
  themeTokens,
  workspaceRoots,
  workspaceTrusted,
  workspaceTrustNonce,
  zenMode,
}: AxonAppEffectsOptions) {
  useEffect(() => {
    window.axonEditorSettings = settings;
  }, [settings]);

  useEffect(() => {
    let cancelled = false;

    async function loadResumeRequest() {
      try {
        const request = await window.axon.getAgentResumeRequest();
        if (!cancelled && request) {
          setAgentResumeRequest(request);
          setAgentResumeRequested(true);
          setAgentSidebarOpen(true);
        }
      } catch (err) {
        console.error("failed to load agent resume request:", err);
      }
    }

    void loadResumeRequest();
    return () => {
      cancelled = true;
    };
  }, [setAgentResumeRequest, setAgentResumeRequested, setAgentSidebarOpen]);

  useEffect(() => {
    return window.axon.onAgentResumeRequest((request) => {
      setAgentResumeRequest(request);
      setAgentResumeRequested(true);
      setAgentSidebarOpen(true);
    });
  }, [setAgentResumeRequest, setAgentResumeRequested, setAgentSidebarOpen]);

  useEffect(() => {
    window.axon
      .listAvailableFonts()
      .then(setAvailableFonts)
      .catch((err) => {
        console.error("failed to list available fonts:", err);
        setAvailableFonts([]);
      });
  }, [setAvailableFonts]);

  useEffect(() => {
    setWorkspaceRoots((currentRoots: WorkspaceRoot[]) =>
      currentRoots.map((root) => ({
        ...root,
        trusted: getWorkspaceTrustState(root.path),
      })),
    );
  }, [setWorkspaceRoots, workspaceTrustNonce]);

  useEffect(() => {
    if (workspaceTrusted || !folderPath) return;

    setTerminalOpen(false);
    setTaskRunnerOpen(false);
    setExtensionsOpen(false);
    setAgentSidebarOpen(false);
    activeLanguageServerStartRef.current.clear();
    void window.axon.stopLanguageServers(folderPath).catch((err) => {
      console.error(
        "failed to stop language servers for untrusted workspace:",
        err,
      );
    });
  }, [
    activeLanguageServerStartRef,
    folderPath,
    setAgentSidebarOpen,
    setExtensionsOpen,
    setTaskRunnerOpen,
    setTerminalOpen,
    workspaceTrusted,
  ]);

  useEffect(() => {
    // Theme selection has to be applied at the app level, not only when an
    // editor widget mounts. Settings preview can change the active theme while
    // no editor has remounted, and Monaco keeps a global theme registry. This
    // effect keeps Monaco's active theme synchronized with Axon's resolved UI
    // tokens on every settings change.
    registerAxonTheme(
      monaco,
      activeThemeId,
      themeTokens,
      extensionThemes,
    );
  }, [activeThemeId, extensionThemes, themeTokens]);

  useEffect(() => {
    if (
      !folderPath ||
      !settings.lsp.enabled ||
      !workspaceTrusted ||
      !activePane?.activeFile
    ) {
      return;
    }

    const languageId = detectLanguageServerLanguage(activePane.activeFile);
    const startKey = `${folderPath}::${languageId}`;
    if (activeLanguageServerStartRef.current.has(startKey)) return;
    if (!window.axon.startLanguageServerForLanguage) return;
    activeLanguageServerStartRef.current.add(startKey);

    void window.axon
      .startLanguageServerForLanguage({ folderPath, languageId })
      .then((result) => {
        if (result.message.startsWith("No external language server")) return;
        // Workspace open now warms marker-matched servers immediately. This
        // active-file path is the fallback for loose files or languages whose
        // marker was not present at the root, so delaying it makes the first
        // hover/completion feel colder without reducing real startup load.
        if (!result.ok) {
          activeLanguageServerStartRef.current.delete(startKey);
        }
        appendOutput("lsp", result.message, result.ok ? "success" : "error");
      })
      .catch((err) => {
        // IPC errors are transient from the renderer's point of view. If the
        // key stayed locked here, one failed bridge call would permanently
        // block the next active-file change from starting the server again.
        activeLanguageServerStartRef.current.delete(startKey);
        appendOutput(
          "lsp",
          err instanceof Error
            ? err.message
            : "Failed to start language server.",
          "error",
        );
      });
  }, [
    activePane?.activeFile,
    activeLanguageServerStartRef,
    appendOutput,
    folderPath,
    settings.lsp.enabled,
    workspaceTrusted,
  ]);

  useEffect(() => {
    window.axon
      .getSettings(null)
      .then((nextSettings) => setSettings(normalizeSettings(nextSettings)))
      .catch((err) => {
        console.error("failed to load settings:", err);
      })
      .finally(() => {
        setSettingsHydrated(true);
      });
  }, [setSettings, setSettingsHydrated]);

  useEffect(() => {
    // Axon uses two update data streams on purpose:
    //
    // - checkForUpdates reads the public GitHub release so the UI can show the
    //   newest version and render release notes as markdown.
    // - onUpdateState mirrors electron-updater's packaged-app lifecycle so the
    //   modal can move from Update -> progress -> Restart without guessing.
    //
    // Keeping those separate lets dev builds still preview release notes while
    // packaged builds get the real download/install path.
    window.axon
      .checkForUpdates()
      .then((nextUpdateInfo) => {
        setUpdateInfo(nextUpdateInfo);
        if (nextUpdateInfo.updateAvailable) {
          appendOutput(
            "update",
            `Axon ${nextUpdateInfo.latestVersion} is available.`,
            "success",
          );
        }
      })
      .catch((err) => {
        console.error("failed to check for updates:", err);
      });

    window.axon
      .getUpdateInstallState()
      .then(setUpdateInstallState)
      .catch((err) => {
        // Dev launches can briefly race ahead of the main-process handlers if
        // the renderer is talking to an older compiled main bundle. In that
        // case I keep the UI on the idle state instead of turning a stale
        // bootstrap mismatch into a noisy console error that does not help the
        // user.
        if (
          err instanceof Error &&
          err.message.includes("No handler registered")
        ) {
          setUpdateInstallState({ phase: "idle" });
          return;
        }
        console.error("failed to load updater state:", err);
      });

    return window.axon.onUpdateState(setUpdateInstallState);
  }, [appendOutput, setUpdateInfo, setUpdateInstallState]);

  useEffect(() => {
    const styleId = "axon-custom-fonts";
    let styleElement = document.getElementById(
      styleId,
    ) as HTMLStyleElement | null;

    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    let active = true;
    const allCustomFonts = [...availableFonts, ...settings.customFonts];
    styleElement.textContent = createBundledFontFaces();
    void Promise.all(
      allCustomFonts.map(async (font) => ({
        font,
        url: await window.axon.getLocalAssetUrl(font.path),
      })),
    )
      .then((authorizedFonts) => {
        if (!active || !styleElement) return;
        const customFontFaces = authorizedFonts
          .map(({ font, url }) => {
            const family = escapeCssString(font.family);
            const authorizedUrl = escapeCssString(url);
            const weight = font.weight ? `font-weight:${font.weight};` : "";
            const style = font.style ? `font-style:${font.style};` : "";
            const stretch = font.stretch
              ? `font-stretch:${font.stretch};`
              : "";
            return `@font-face{font-family:"${family}";src:url("${authorizedUrl}");${weight}${style}${stretch}font-display:swap;}`;
          })
          .join("\n");
        styleElement.textContent = [
          createBundledFontFaces(),
          customFontFaces,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .catch((error) => {
        console.error("failed to authorize custom fonts:", error);
      });

    return () => {
      active = false;
    };
  }, [availableFonts, settings.customFonts]);

  useEffect(() => {
    return onEditorDiagnosticsChanged(setMonacoDiagnostics);
  }, [setMonacoDiagnostics]);

  useEffect(() => {
    setProjectDiagnostics([]);
  }, [folderPath, setProjectDiagnostics]);

  useEffect(() => {
    setLspDiagnosticsByFile({});
    clearLanguageServerDiagnosticsFromMonaco();
    if (!folderPath || !settings.lsp.enabled) return;

    // LSP diagnostics arrive asynchronously from whichever server owns the
    // changed document. Keeping them keyed by file lets a server clear one
    // file's diagnostics without wiping problems from another language server.
    return window.axon.onLanguageServerDiagnostics((event) => {
      if (event.folderPath !== folderPath) return;
      setLspDiagnosticsByFile((current: Record<string, EditorDiagnostic[]>) =>
        updateLspDiagnosticCache(
          current,
          event.filePath,
          event.serverId,
          event.diagnostics,
        ),
      );
    });
  }, [folderPath, setLspDiagnosticsByFile, settings.lsp.enabled]);

  useEffect(() => {
    const diagnosticsByFile = (
      Object.values(lspDiagnosticsByFile) as EditorDiagnostic[][]
    )
      .flat()
      .reduce<Record<string, EditorDiagnostic[]>>(
        (nextDiagnostics, diagnostic: EditorDiagnostic) => {
          nextDiagnostics[diagnostic.path] = [
            ...(nextDiagnostics[diagnostic.path] ?? []),
            diagnostic,
          ];
          return nextDiagnostics;
        },
        {},
      );

    syncLanguageServerDiagnosticsToMonaco(diagnosticsByFile);
  }, [lspDiagnosticsByFile]);

  useEffect(() => {
    if (!folderPath || !settings.lsp.enabled) return;

    // Language servers fail for normal project reasons: a runtime can be
    // missing, Pyright can reject a virtualenv path, or a server can still be
    // warming up while Monaco asks for completion. Surfacing main-process LSP
    // logs in the Output panel keeps those failures visible without forcing the
    // user to open DevTools just to understand why autocomplete is quiet.
    return window.axon.onLanguageServerLog((event) => {
      if (event.folderPath !== folderPath) return;
      appendOutput("lsp", `[${event.serverId}] ${event.message}`, event.level);
    });
  }, [appendOutput, folderPath, settings.lsp.enabled]);

  useEffect(() => {
    const handleFileSaved = (event: Event) => {
      const saveEvent = event as CustomEvent<{ path?: string }>;
      const savedPath = saveEvent.detail?.path;
      if (!savedPath) return;

      const workspaceSettingsPath = folderPath
        ? `${folderPath}/axon.json`
        : null;
      if (
        savedPath !== workspaceSettingsPath &&
        savedPath !== settingsJsonPath
      ) {
        if (workspaceTrusted) {
          void refreshProjectDiagnostics();
        }
        void refreshGitStatus({ silent: true });
        return;
      }

      // Manual settings edits should take effect as soon as the user saves the
      // file. We still route through the main-process settings reader so the
      // same validation and default-filling logic protects both app settings
      // and explicit project axon.json paths.
      window.axon
        .getSettings(folderPath)
        .then((nextSettings) => setSettings(normalizeSettings(nextSettings)))
        .catch((err) => {
          console.error("failed to reload settings json:", err);
        });
      if (workspaceTrusted) {
        void refreshProjectDiagnostics();
      }
      void refreshGitStatus({ silent: true });
    };

    window.addEventListener("axon:fileSaved", handleFileSaved);
    return () => window.removeEventListener("axon:fileSaved", handleFileSaved);
  }, [
    folderPath,
    refreshGitStatus,
    refreshProjectDiagnostics,
    setSettings,
    settingsJsonPath,
    workspaceTrusted,
  ]);

  useEffect(() => {
    const cleanup = window.axon.onFolderChanged((event) => {
      if (!folderPath) return;
      const changes = folderChanges(event ?? {});

      changes.forEach(({ path: changedPath }) => {
        const changedModel = getModel(changedPath);
        const hasUnsavedChanges = layout.panes.some(
          (pane: { dirtyFiles: Record<string, boolean> }) =>
            pane.dirtyFiles?.[changedPath] === true,
        );

        if (changedModel && !changedModel.isDisposed() && !hasUnsavedChanges) {
          void readFile(changedPath)
            .then((file) => {
              updateModel(changedPath, file.content);
              window.dispatchEvent(
                new CustomEvent("axon:fileSynchronized", {
                  detail: { path: changedPath, content: file.content },
                }),
              );
              setProjectDiagnostics((current: EditorDiagnostic[]) =>
                current.filter((diagnostic) => diagnostic.path !== changedPath),
              );
              setLspDiagnosticsByFile(
                (current: Record<string, EditorDiagnostic[]>) =>
                  Object.fromEntries(
                    Object.entries(current)
                      .map(([key, diagnostics]) => [
                        key,
                        diagnostics.filter(
                          (diagnostic) => diagnostic.path !== changedPath,
                        ),
                      ])
                      .filter(([, diagnostics]) => diagnostics.length > 0),
                  ),
              );
              setMonacoDiagnostics(collectEditorDiagnostics());
            })
            .catch((err) => {
              console.warn("failed to reload externally changed file:", err);
            });
        }
      });

      if (!shouldReloadWorkspaceRoot(folderPath, event ?? {})) return;

      if (folderRefreshTimerRef.current) {
        window.clearTimeout(folderRefreshTimerRef.current);
      }

      folderRefreshTimerRef.current = window.setTimeout(() => {
        const requestId = folderRefreshRequestRef.current + 1;
        folderRefreshRequestRef.current = requestId;

        getTree(folderPath)
          .then((nextTree) => {
            if (folderRefreshRequestRef.current === requestId) {
              setTree(nextTree);
            }
          })
          .catch(console.error);
      }, 16);
    });
    return () => {
      cleanup();
      if (folderRefreshTimerRef.current) {
        window.clearTimeout(folderRefreshTimerRef.current);
        folderRefreshTimerRef.current = null;
      }
    };
  }, [
    folderPath,
    folderRefreshRequestRef,
    folderRefreshTimerRef,
    layout.panes,
    setLspDiagnosticsByFile,
    setMonacoDiagnostics,
    setProjectDiagnostics,
    setTree,
  ]);

  useEffect(() => {
    const cleanup = window.axon.onGitChanged((event) => {
      if (event?.folderPath && event.folderPath !== folderPath) return;
      void refreshGitStatus({ silent: true });
    });
    return cleanup;
  }, [folderPath, refreshGitStatus]);

  useEffect(() => {
    if (!folderPath) return;

    // Main-process native watcher events remain the immediate path. This
    // renderer-owned fallback is deliberately separate because each Axon
    // window must refresh its own repository even when a packaged background
    // event is dropped. A workspace that is not a repository polls slowly so
    // `git init` can promote it without a reopen; active repositories retain
    // the shorter recovery interval. The status function coalesces overlap.
    const refresh = () => void refreshGitStatus({ silent: true });
    const handleVisibility = () => {
      if (!document.hidden) refresh();
    };
    const interval = window.setInterval(
      refresh,
      gitStatus?.isRepository ? 2_000 : 5_000,
    );
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [folderPath, gitStatus?.isRepository, refreshGitStatus]);

  useEffect(() => {
    const cleanupHtmlPreviewConsole = window.axon.onHtmlPreviewConsole(
      (event) => {
        const location = event.source
          ? ` (${event.source}${event.line ? `:${event.line}` : ""})`
          : "";
        appendOutput(
          "html preview",
          `${event.message}${location}`,
          event.level === "error"
            ? "error"
            : event.level === "warn"
              ? "warning"
              : "info",
        );
      },
    );
    const cleanupOutput = window.axon.onTaskOutput((event) => {
      appendOutput(
        event.label,
        event.line,
        event.stream === "stderr" ? "warning" : "info",
      );
    });
    const cleanupFinished = window.axon.onTaskFinished((event) => {
      appendOutput(
        event.label,
        event.exitCode === 0
          ? "Task completed successfully."
          : `Task exited with ${event.exitCode ?? event.signal ?? "unknown"}.`,
        event.exitCode === 0 ? "success" : "error",
      );
    });

    return () => {
      cleanupHtmlPreviewConsole();
      cleanupOutput();
      cleanupFinished();
    };
  }, [appendOutput]);

  useEffect(() => {
    if (restoreStartedRef.current) return;
    restoreStartedRef.current = true;

    window.axon
      .shouldRestoreSession()
      .then(async (shouldRestoreSession) => {
        if (!shouldRestoreSession) {
          allowSessionPersistenceRef.current = false;
          setSessionReady(true);
          return;
        }

        const session = await loadWorkspaceSession();
        if (!session?.folderPath) {
          setSessionReady(true);
          return;
        }

        setLoading(true);
        markAxonPerformance("axon.workspace.restore.start", {
          source: "session",
        });
        markAxonPerformance("axon.workspace.tree.start", {
          source: "session",
        });
        getTree(session.folderPath)
          .then(async (fileTree) => {
            markAxonPerformance("axon.workspace.tree.end", {
              source: "session",
            });
            measureAxonPerformance(
              "axon.workspace.tree",
              "axon.workspace.tree.start",
              "axon.workspace.tree.end",
            );
            addRecentFolder(session.folderPath as string);
            await handleFolderChange(
              session.folderPath as string,
              fileTree,
              session,
            );
            markAxonPerformance("axon.workspace.restore.end", {
              source: "session",
            });
            measureAxonPerformance(
              "axon.workspace.restore",
              "axon.workspace.restore.start",
              "axon.workspace.restore.end",
            );
            appendOutput(
              "workspace",
              `Restored ${session.folderPath}`,
              "success",
            );
          })
          .catch((err) => {
            console.error("failed to restore workspace session:", err);
            appendOutput(
              "workspace",
              "Failed to restore previous workspace.",
              "error",
            );
          })
          .finally(() => {
            setLoading(false);
            setSessionReady(true);
          });
      })
      .catch((err) => {
        console.error("failed to read window restore mode:", err);
        setSessionReady(true);
      });
  }, [
    allowSessionPersistenceRef,
    appendOutput,
    handleFolderChange,
    restoreStartedRef,
    setLoading,
    setSessionReady,
  ]);

  useEffect(() => {
    if (!sessionReady) return;
    if (!allowSessionPersistenceRef.current) return;

    // Only UI/navigation state is persisted here, never dirty editor contents.
    // Restoring unsaved buffers would require a separate crash-safe draft store;
    // until that exists, saving paths/tabs/panels gives useful continuity
    // without pretending unsaved edits are protected.
    void saveWorkspaceSession({
      folderPath,
      roots: workspaceRoots,
      activeRootId,
      layout,
      sidebarCollapsed,
      sidebarWidth,
      terminalOpen,
      bottomPanelOpen,
      bottomPanelTab,
    }).catch((error) => {
      console.error("failed to save workspace session:", error);
    });
  }, [
    bottomPanelOpen,
    bottomPanelTab,
    activeRootId,
    allowSessionPersistenceRef,
    folderPath,
    layout,
    sessionReady,
    sidebarCollapsed,
    sidebarWidth,
    terminalOpen,
    workspaceRoots,
  ]);

  useEffect(() => {
    const handleNavigateToFile = (event: Event) => {
      const navigationEvent = event as CustomEvent<
        Omit<EditorNavigationTarget, "id">
      >;
      if (!navigationEvent.detail?.path) return;
      handleOpenNavigationTarget(navigationEvent.detail);
    };

    window.addEventListener("axon:navigateToFile", handleNavigateToFile);
    return () =>
      window.removeEventListener("axon:navigateToFile", handleNavigateToFile);
  }, [handleOpenNavigationTarget]);

  useEffect(() => {
    window.axonCompletionWorkspacePath = workspaceTrusted ? folderPath : null;
  }, [folderPath, workspaceTrusted]);

  useEffect(() => {
    // The CLI opens projects through the main process because `axon .` is
    // launched outside the renderer. The event goes through the same
    // `getTree -> handleFolderChange` path as the folder picker so settings,
    // recent folders, Git state, file watching, and workspace trust all update
    // together instead of only replacing the folder path string.
    const handledCliFolders = new Set<string>();
    const openCliFolder = (nextFolderPath: string) => {
      if (handledCliFolders.has(nextFolderPath)) return;
      handledCliFolders.add(nextFolderPath);
      setLoading(true);
      appendOutput("workspace", `Opening ${nextFolderPath}`);
      markAxonPerformance("axon.workspace.cliOpen.start", { source: "cli" });
      markAxonPerformance("axon.workspace.tree.start", { source: "cli" });
      getTree(nextFolderPath)
        .then(async (fileTree) => {
          markAxonPerformance("axon.workspace.tree.end", { source: "cli" });
          measureAxonPerformance(
            "axon.workspace.tree",
            "axon.workspace.tree.start",
            "axon.workspace.tree.end",
          );
          addRecentFolder(nextFolderPath);
          await handleFolderChange(
            nextFolderPath,
            fileTree,
            null,
            undefined,
            "cli",
          );
          markAxonPerformance("axon.workspace.cliOpen.end", { source: "cli" });
          measureAxonPerformance(
            "axon.workspace.cliOpen",
            "axon.workspace.cliOpen.start",
            "axon.workspace.cliOpen.end",
          );
          appendOutput("workspace", `Opened ${nextFolderPath}`, "success");
        })
        .catch((err) => {
          console.error("failed to open folder from CLI:", err);
          appendOutput("workspace", "Failed to open folder from CLI.", "error");
        })
        .finally(() => {
          setLoading(false);
        });
    };

    // Pull first, then subscribe. This handles the cold-start path where macOS
    // sent `open-file` before React mounted. Already-running CLI opens are now
    // delivered into a fresh managed window, but this renderer still consumes
    // the request the same way once that window is ready.
    window.axon
      .consumeCliOpenFolder()
      .then((nextFolderPath) => {
        if (nextFolderPath) openCliFolder(nextFolderPath);
      })
      .catch((err) => {
        console.error("failed to consume CLI folder request:", err);
      });

    const cleanup = window.axon.onCliOpenFolder((nextFolderPath) => {
      // The push event intentionally does not clear the main-process queue;
      // clearing happens through the explicit consume call so a renderer reload
      // cannot accidentally lose the folder request mid-flight.
      void window.axon.consumeCliOpenFolder();
      openCliFolder(nextFolderPath);
    });

    return cleanup;
  }, [appendOutput, handleFolderChange, setLoading]);

  useEffect(() => {
    const cleanup = window.axon.onMenuCommand(runCommand);

    return cleanup;
  }, [runCommand]);

  useGlobalEditorShortcuts({
    settings,
    zenMode,
    runCommand,
    onSaveSettings: handleSettingsSave,
    onSetZenMode: setZenMode,
  });
}
