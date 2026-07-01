import { useEffect } from "react";
import { addRecentFolder, getWorkspaceTrustState } from "../../../renderer/features/sidebar";
import { clearLanguageServerDiagnosticsFromMonaco, collectEditorDiagnostics, onEditorDiagnosticsChanged, syncLanguageServerDiagnosticsToMonaco, type EditorDiagnostic } from "../../../renderer/features/diagnostics/lib/diagnostics";
import { updateLspDiagnosticCache } from "../../../renderer/features/diagnostics/lib/diagnosticCache";
import { detectLanguageServerLanguage, getModel, updateModel } from "../../../renderer/features/editor/lib/monacoModels";
import { useGlobalEditorShortcuts } from "../../../renderer/features/editor/shortcuts/useGlobalEditorShortcuts";
import { getTree, readFile } from "../../../renderer/shared/lib/api";
import { createBundledFontFaces } from "../../../renderer/shared/lib/bundledFonts";
import { registerAxonTheme } from "../../../renderer/shared/lib/soraTheme";
import { loadWorkspaceSession, saveWorkspaceSession } from "../../../renderer/shared/lib/workspaceSession";
import { normalizeSettings } from "../../../shared/settings";
import * as monaco from "monaco-editor";
import { escapeCssString } from "./appPath";
import type { EditorNavigationTarget } from "../../../renderer/features/editor/lib/navigation";

interface AxonAppEffectsOptions {
  activeLanguageServerStartRef: any;
  activePane: any;
  activeRootId: any;
  allowSessionPersistenceRef: any;
  appendOutput: any;
  availableFonts: any;
  bottomPanelOpen: any;
  bottomPanelTab: any;
  extensionThemes: any;
  folderPath: any;
  folderRefreshRequestRef: any;
  folderRefreshTimerRef: any;
  handleDownloadUpdate: any;
  handleFolderChange: any;
  handleOpenNavigationTarget: any;
  handleSettingsSave: any;
  layout: any;
  lspDiagnosticsByFile: any;
  refreshExtensions: any;
  refreshGitStatus: any;
  refreshProjectDiagnostics: any;
  restoreStartedRef: any;
  runCommand: any;
  sessionReady: any;
  settings: any;
  settingsHydrated: any;
  settingsJsonPath: any;
  sidebarCollapsed: any;
  sidebarWidth: any;
  setAgentResumeRequest: any;
  setAgentResumeRequested: any;
  setAgentSidebarOpen: any;
  setAvailableFonts: any;
  setExtensionsOpen: any;
  setLoading: any;
  setLspDiagnosticsByFile: any;
  setMonacoDiagnostics: any;
  setProjectDiagnostics: any;
  setSessionReady: any;
  setSettings: any;
  setSettingsHydrated: any;
  setTaskRunnerOpen: any;
  setTerminalOpen: any;
  setTree: any;
  setUpdateInfo: any;
  setUpdateInstallState: any;
  setWorkspaceRoots: any;
  setZenMode: any;
  terminalOpen: any;
  themeTokens: any;
  updateAutoDownloadVersionRef: any;
  updateInfo: any;
  updateInstallState: any;
  workspaceRoots: any;
  workspaceTrusted: any;
  workspaceTrustNonce: any;
  zenMode: any;
}

export function useAxonAppEffects({
  activeLanguageServerStartRef,
  activePane,
  activeRootId,
  allowSessionPersistenceRef,
  appendOutput,
  availableFonts,
  bottomPanelOpen,
  bottomPanelTab,
  extensionThemes,
  folderPath,
  folderRefreshRequestRef,
  folderRefreshTimerRef,
  handleDownloadUpdate,
  handleFolderChange,
  handleOpenNavigationTarget,
  handleSettingsSave,
  layout,
  lspDiagnosticsByFile,
  refreshExtensions,
  refreshGitStatus,
  refreshProjectDiagnostics,
  restoreStartedRef,
  runCommand,
  sessionReady,
  settings,
  settingsHydrated,
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
  updateAutoDownloadVersionRef,
  updateInfo,
  updateInstallState,
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
  }, []);

  useEffect(() => {
    return window.axon.onAgentResumeRequest((request) => {
      setAgentResumeRequest(request);
      setAgentResumeRequested(true);
      setAgentSidebarOpen(true);
    });
  }, []);

  useEffect(() => {
    window.axon
      .listAvailableFonts()
      .then(setAvailableFonts)
      .catch((err) => {
        console.error("failed to list available fonts:", err);
        setAvailableFonts([]);
      });
  }, []);

  useEffect(() => {
    setWorkspaceRoots((currentRoots: any[]) =>
      currentRoots.map((root: any) => ({
        ...root,
        trusted: getWorkspaceTrustState(root.path),
      })),
    );
  }, [workspaceTrustNonce]);

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
  }, [folderPath, workspaceTrusted]);

  useEffect(() => {
    // Theme selection has to be applied at the app level, not only when an
    // editor widget mounts. Settings preview can change the active theme while
    // no editor has remounted, and Monaco keeps a global theme registry. This
    // effect keeps Monaco's active theme synchronized with Axon's resolved UI
    // tokens on every settings change.
    registerAxonTheme(
      monaco,
      settings.editor.themeId,
      themeTokens,
      extensionThemes,
    );
  }, [extensionThemes, settings.editor.themeId, themeTokens]);

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

    const startTimer = window.setTimeout(() => {
      window.axon
        .startLanguageServerForLanguage({ folderPath, languageId })
        .then((result) => {
          if (result.message.startsWith("No external language server")) return;
          // Language servers should come online after the editor shell and the
          // first file are usable. Starting every relevant server during
          // workspace restore made startup compete with file-tree rendering,
          // Git status, diagnostics, and Monaco on older 8GB Intel machines.
          // This delayed, active-file-only path keeps completions available
          // without turning project open into a background process storm.
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
    }, 900);

    return () => window.clearTimeout(startTimer);
  }, [
    activePane?.activeFile,
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
  }, []);

  useEffect(() => {
    void refreshExtensions();
  }, [refreshExtensions]);

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
  }, [appendOutput]);

  useEffect(() => {
    if (!updateInfo?.updateAvailable) return;
    if (
      updateInstallState.phase !== "idle" &&
      updateInstallState.phase !== "not-available"
    ) {
      return;
    }
    if (updateAutoDownloadVersionRef.current === updateInfo.latestVersion) {
      return;
    }

    updateAutoDownloadVersionRef.current = updateInfo.latestVersion;
    void handleDownloadUpdate();
  }, [
    handleDownloadUpdate,
    updateInfo?.latestVersion,
    updateInfo?.updateAvailable,
    updateInstallState.phase,
  ]);

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

    // Custom fonts are loaded from app-owned axon:// URLs returned by the main
    // process importer. Injecting one style tag from settings keeps the font
    // registry deterministic: changing settings JSON, saving settings, or
    // restarting Axon all rebuild the same @font-face list before UI/editor
    // components ask CSS or Monaco to use those font-family names.
    const allCustomFonts = [...availableFonts, ...settings.customFonts];
    const customFontFaces = allCustomFonts
      .map((font) => {
        const family = escapeCssString(font.family);
        const url = escapeCssString(font.url);
        const weight = font.weight ? `font-weight:${font.weight};` : "";
        const style = font.style ? `font-style:${font.style};` : "";
        const stretch = font.stretch ? `font-stretch:${font.stretch};` : "";
        return `@font-face{font-family:"${family}";src:url("${url}");${weight}${style}${stretch}font-display:swap;}`;
      })
      .join("\n");

    styleElement.textContent = [createBundledFontFaces(), customFontFaces]
      .filter(Boolean)
      .join("\n");
  }, [availableFonts, settings.customFonts]);

  useEffect(() => {
    return onEditorDiagnosticsChanged(setMonacoDiagnostics);
  }, []);

  useEffect(() => {
    setProjectDiagnostics([]);
  }, [folderPath]);

  useEffect(() => {
    setLspDiagnosticsByFile({});
    clearLanguageServerDiagnosticsFromMonaco();
    if (!folderPath || !settings.lsp.enabled) return;

    // LSP diagnostics arrive asynchronously from whichever server owns the
    // changed document. Keeping them keyed by file lets a server clear one
    // file's diagnostics without wiping problems from another language server.
    return window.axon.onLanguageServerDiagnostics((event) => {
      if (event.folderPath !== folderPath) return;
      setLspDiagnosticsByFile((current: any) =>
        updateLspDiagnosticCache(
          current,
          event.filePath,
          event.serverId,
          event.diagnostics,
        ),
      );
    });
  }, [folderPath, settings.lsp.enabled]);

  useEffect(() => {
    const diagnosticsByFile = (Object.values(lspDiagnosticsByFile) as EditorDiagnostic[][])
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
    settingsJsonPath,
    workspaceTrusted,
  ]);

  useEffect(() => {
    const cleanup = window.axon.onFolderChanged((event) => {
      if (!folderPath) return;
      const changedPath = event?.path;

      if (changedPath) {
        const changedModel = getModel(changedPath);
        const hasUnsavedChanges = layout.panes.some(
          (pane: any) => pane.dirtyFiles?.[changedPath] === true,
        );

        if (changedModel && !changedModel.isDisposed() && !hasUnsavedChanges) {
          void readFile(changedPath)
            .then((file) => {
              updateModel(changedPath, file.content);
              setProjectDiagnostics((current: EditorDiagnostic[]) =>
                current.filter((diagnostic) => diagnostic.path !== changedPath),
              );
              setLspDiagnosticsByFile((current: Record<string, EditorDiagnostic[]>) =>
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
      }

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
        void refreshGitStatus({ silent: true });
      }, 90);
    });
    return () => {
      cleanup();
      if (folderRefreshTimerRef.current) {
        window.clearTimeout(folderRefreshTimerRef.current);
        folderRefreshTimerRef.current = null;
      }
    };
  }, [folderPath, layout.panes, refreshGitStatus]);

  useEffect(() => {
    const cleanup = window.axon.onGitChanged(() => {
      void refreshGitStatus({ silent: true });
    });
    return cleanup;
  }, [refreshGitStatus]);

  useEffect(() => {
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
      cleanupOutput();
      cleanupFinished();
    };
  }, [appendOutput]);

  useEffect(() => {
    if (restoreStartedRef.current) return;
    restoreStartedRef.current = true;

    window.axon
      .shouldRestoreSession()
      .then((shouldRestoreSession) => {
        if (!shouldRestoreSession) {
          allowSessionPersistenceRef.current = false;
          setSessionReady(true);
          return;
        }

        const session = loadWorkspaceSession();
        if (!session?.folderPath) {
          setSessionReady(true);
          return;
        }

        setLoading(true);
        getTree(session.folderPath)
          .then(async (fileTree) => {
            addRecentFolder(session.folderPath as string);
            await handleFolderChange(
              session.folderPath as string,
              fileTree,
              session,
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
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    if (!folderPath && !allowSessionPersistenceRef.current) return;

    // Only UI/navigation state is persisted here, never dirty editor contents.
    // Restoring unsaved buffers would require a separate crash-safe draft store;
    // until that exists, saving paths/tabs/panels gives useful continuity
    // without pretending unsaved edits are protected.
    saveWorkspaceSession({
      folderPath,
      roots: workspaceRoots,
      activeRootId,
      layout,
      sidebarCollapsed,
      sidebarWidth,
      terminalOpen,
      bottomPanelOpen,
      bottomPanelTab,
    });
  }, [
    bottomPanelOpen,
    bottomPanelTab,
    activeRootId,
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
      getTree(nextFolderPath)
        .then(async (fileTree) => {
          addRecentFolder(nextFolderPath);
          await handleFolderChange(nextFolderPath, fileTree);
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
    // sent `open-file` before React mounted. The live event below handles the
    // already-running path where `axon .` targets an existing Axon window.
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
