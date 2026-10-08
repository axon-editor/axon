/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from "react";
import Sidebar from "../../../renderer/features/sidebar";
import EditorPane from "../../../renderer/features/editor/components/panes/EditorPane";
import EditorToolbar from "../../../renderer/features/editor/components/toolbar/EditorToolbar";
import { AXON_COMMANDS } from "../../../shared/commands";
import { type ThemeId } from "../../../shared/settings";
import AppMenuButton from "../chrome/AppMenuButton";
import {
  closePane,
  moveTabBetweenPanes,
  openFileInPane,
  removePathFromLayout,
  reorderTabsInPane,
  replacePathInLayout,
  setDirtyInPane,
  setPinnedInPane,
} from "../../../renderer/features/editor/lib/layout/layoutManager";
import { activatePane } from "../../../renderer/features/editor/lib/layout/paneActivation";
import { detectLanguage } from "../../../renderer/features/editor/lib/buffer/monacoModels";
import { fontStack } from "../../../renderer/shared/lib/fonts";
import WorkbenchOverlays from "./WorkbenchOverlays";
import WorkbenchStatusBar from "./WorkbenchStatusBar";
import WorkspaceSafetyOverlays from "./WorkspaceSafetyOverlays";
import ZenCommandLine from "./ZenCommandLine";
import { useZenTransition } from "../lib/useZenTransition";
import { openGitCommitDiff } from "@axon-builtin-git/git/lib/gitGraphTab";
import type { AxonWorkbenchLayoutProps } from "../AxonAppView";

// Matches the fade duration of .axon-zen-chrome in App.css so chrome unmounts
// exactly when its cross-fade finishes.
const ZEN_CHROME_TRANSITION_MS = 200;

const Terminal = React.lazy(() => import("@axon-builtin-terminal/Terminal"));
const AxonAgentSidebar = React.lazy(
  () => import("@axon-builtin-agent/AxonAgentSidebar"),
);
const SpotifyFloatingPlayer = React.lazy(
  () => import("@axon-builtin-spotify/SpotifyFloatingPlayer"),
);

// Matches the sidebar header's pl-20. The mac traffic lights sit at x:14 and
// span roughly 66px, so 80px clears them with room to spare. Anything smaller
// and the last light kisses the label again.
const MAC_TRAFFIC_LIGHT_INSET_PX = 80;
// Windows draws its caption overlay (min/max/close, ~138px wide) over the
// top-right of the renderer. 150 keeps the terminal header buttons clear of it
// and matches the zen-mode end inset.
const WINDOWS_CAPTION_INSET_PX = 150;

export default function AxonWorkbenchLayout(props: AxonWorkbenchLayoutProps) {
  const {
    activeFileContent,
    activePane,
    activeRootId,
    agentActionRequest,
    agentResumeRequest,
    agentResumeRequested,
    agentSidebarOpen,
    appThemeCssVariables,
    availableFonts,
    bottomPanelOpen,
    bottomPanelTab,
    deletedFiles,
    diagnostics,
    extensionState,
    folderPath,
    folderPickerIntent,
    gitStatus,
    handleApplyAgentEdit,
    handleFileSelect,
    handleFolderChange,
    handleNewFile,
    handleOpenFolder,
    handleOpenHtmlPreview,
    handleOpenNavigationTarget,
    handleOpenPathInTerminal,
    handleOpenTabInTerminal,
    handleRefresh,
    handleSettingsPreview,
    handleSettingsSave,
    handleSplit,
    handleSwitchWorkspaceRoot,
    layout,
    language,
    loading,
    navigationTarget,
    outputEntries,
    platform,
    requestCloseTab,
    runCommand,
    settings,
    settingsHydrated,
    sidebarCollapsed,
    sidebarView,
    sidebarWidth,
    spotifyActions,
    spotifyPlayerOpen,
    spotifyState,
    terminalCreateNonce,
    terminalCreateWorkingDirectory,
    terminalColors,
    terminalOpen,
    themeSyntax,
    themeTokens,
    tree,
    updateInfo,
    updateInstallState,
    windowFullScreen,
    workspaceRoots,
    workspaceTrusted,
    zenMode,
    setAboutOpen,
    setAgentSidebarOpen,
    setBottomPanelOpen,
    setBottomPanelTab,
    setFolderPickerIntent,
    setLanguage,
    setLanguageToolsOpen,
    setLayout,
    setSidebarCollapsed,
    setSidebarWidth,
    setSpotifyPlayerOpen,
    setTerminalOpen,
    setUpdateModalOpen,
    setWorkspaceTrustNonce,
    setCursorInfo,
  } = props;
  const {
    agentSidebarWidth,
    agentContribution,
    setAgentSidebarWidth,
    spotifyContribution,
    terminalContribution,
    welcomeThemeItems,
  } = props;
  const mainSidebarSide =
    settings.editor.sidebarSide === "right" ? "right" : "left";
  const { zenActive, chromeMounted } = useZenTransition(
    zenMode,
    ZEN_CHROME_TRANSITION_MS,
  );
  // Zen entry must land on a clean canvas: panels, terminals and the agent
  // sidebar drop away with the rest of the chrome and can be summoned back one
  // keystroke at a time. The sidebar collapses (not unmounts, that would break
  // Cmd+B) but everything is remembered and restored on the way out so zen never
  // permanently reshapes the layout it found.
  const wasZen = React.useRef(zenMode);
  const preZenStateRef = React.useRef<{
    sidebarCollapsed: boolean;
    terminalOpen: boolean;
    bottomPanelOpen: boolean;
    agentSidebarOpen: boolean;
  } | null>(null);
  React.useEffect(() => {
    if (zenMode && !wasZen.current) {
      preZenStateRef.current = {
        sidebarCollapsed,
        terminalOpen,
        bottomPanelOpen,
        agentSidebarOpen,
      };
      setTerminalOpen(false);
      setBottomPanelOpen(false);
      setAgentSidebarOpen(false);
      setSidebarCollapsed(true);
    } else if (!zenMode && wasZen.current) {
      const previous = preZenStateRef.current;
      if (previous) {
        setSidebarCollapsed(previous.sidebarCollapsed);
        setTerminalOpen(previous.terminalOpen);
        setBottomPanelOpen(previous.bottomPanelOpen);
        setAgentSidebarOpen(previous.agentSidebarOpen);
        preZenStateRef.current = null;
      }
    }
    wasZen.current = zenMode;
  }, [
    agentSidebarOpen,
    bottomPanelOpen,
    setAgentSidebarOpen,
    setBottomPanelOpen,
    setSidebarCollapsed,
    setTerminalOpen,
    sidebarCollapsed,
    terminalOpen,
    zenMode,
  ]);
  const shouldShowAgentSidebar =
    settings.ai.enabled && agentSidebarOpen && !!agentContribution;
  const canShowSpotify = !!spotifyContribution;
  const agentSidebarNode = shouldShowAgentSidebar ? (
    <React.Suspense fallback={null}>
      <AxonAgentSidebar
        activeFileContent={activeFileContent}
        activeFileLanguage={
          activePane?.activeFile
            ? detectLanguage(activePane.activeFile)
            : "plaintext"
        }
        activeFilePath={activePane?.activeFile ?? null}
        diagnostics={diagnostics}
        folderPath={folderPath}
        gitChanges={gitStatus?.changes ?? []}
        initialAction={agentActionRequest}
        resumeConversationId={agentResumeRequest?.conversationId ?? null}
        resumeRequested={agentResumeRequested}
        side="right"
        width={agentSidebarWidth}
        onApplyEdit={handleApplyAgentEdit}
        onClose={() => setAgentSidebarOpen(false)}
        onWidthChange={setAgentSidebarWidth}
      />
    </React.Suspense>
  ) : null;
  const mainSidebarOrder = mainSidebarSide === "right" ? 3 : 1;
  const editorOrder = 2;
  const agentSidebarOrder = 4;
  const reserveMacTrafficLightSpace =
    platform === "darwin" && !windowFullScreen;
  const zenNativeControlInset = zenActive
    ? {
        start: reserveMacTrafficLightSpace ? 92 : 0,
        end: platform === "win32" ? 150 : 0,
      }
    : undefined;
  // A zoomed terminal stretches to the window's top strip, so its header only
  // collides with the native controls when the editor column is the outermost
  // element: sidebar collapsed (it unmounts instead of shrinking) or parked on
  // the right. Docked panels never need this because their header sits at the
  // bottom of the column, and zen mode hides the terminal outright. The end
  // inset mirrors the same logic for the Windows caption overlay on the right
  // edge, where the agent sidebar or a right-side main sidebar would cover it.
  const terminalNativeControlInset = {
    start:
      reserveMacTrafficLightSpace &&
      (sidebarCollapsed || mainSidebarSide === "right")
        ? MAC_TRAFFIC_LIGHT_INSET_PX
        : 0,
    end:
      platform === "win32" &&
      mainSidebarSide !== "right" &&
      !shouldShowAgentSidebar
        ? WINDOWS_CAPTION_INSET_PX
        : 0,
  };
  const uiFontFamily = fontStack(
    settings.editor.uiFontFamily,
    "system-ui, sans-serif",
  );

  return (
    <div
      className={`axon-app-root relative flex h-full w-full flex-col overflow-hidden${zenActive ? " axon-zen-mode" : ""}`}
      style={
        {
          ...appThemeCssVariables,
          "--axon-ui-font-family": uiFontFamily,
          background: "var(--axon-background)",
          fontFamily: uiFontFamily,
          fontWeight: settings.editor.fontWeight,
          letterSpacing: 0,
        } as React.CSSProperties
      }
    >
      {zenActive && (
        <div
          className="absolute top-0 left-0 right-0 h-9 z-40"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
      )}

      <div className={`flex flex-1 overflow-hidden ${zenActive ? "pt-9" : ""}`}>
        {(chromeMounted || !sidebarCollapsed) && (
          <div
            className={`${chromeMounted ? "axon-zen-chrome" : ""} flex shrink-0`}
            style={{ order: mainSidebarOrder }}
          >
            <Sidebar
              tree={tree}
              folderPath={folderPath}
              workspaceRoots={workspaceRoots}
              activeRootId={activeRootId}
              activeFile={activePane?.activeFile ?? null}
              onFileSelect={handleFileSelect}
              onOpenFolder={handleOpenFolder}
              onFolderChange={handleFolderChange}
              onSwitchWorkspaceRoot={handleSwitchWorkspaceRoot}
              onRefresh={handleRefresh}
              loading={loading}
              collapsed={sidebarCollapsed}
              width={sidebarWidth}
              onWidthChange={setSidebarWidth}
              view={sidebarView}
              rememberExpandedFolders={settings.editor.rememberExpandedFolders}
              onOpenGitHistoryFile={(commit, file, diff) => {
                openGitCommitDiff({ commit, file, diff });
              }}
              onSplitFile={(filePath) => handleSplit("right", filePath)}
              onOpenInTerminal={handleOpenPathInTerminal}
              onOpenHtmlPreview={handleOpenHtmlPreview}
              onEntryDeleted={(path) =>
                setLayout((prev) => removePathFromLayout(prev, path))
              }
              onEntryMoved={(oldPath, newPath) =>
                setLayout((prev) => replacePathInLayout(prev, oldPath, newPath))
              }
              onEntryRenamed={(oldPath, newPath) =>
                setLayout((prev) => replacePathInLayout(prev, oldPath, newPath))
              }
              gitChanges={gitStatus?.changes ?? []}
              ignoredPaths={gitStatus?.ignoredPaths ?? []}
              folderPickerIntent={folderPickerIntent}
              onOpenFolderPicker={() => setFolderPickerIntent("folder")}
              onCloseFolderPicker={() => setFolderPickerIntent(null)}
              reserveMacTrafficLightSpace={reserveMacTrafficLightSpace}
              enableSpotify={canShowSpotify}
              spotifyState={spotifyState}
              spotifyActions={spotifyActions}
              playerOpen={spotifyPlayerOpen}
              onTogglePlayer={() => setSpotifyPlayerOpen((p: boolean) => !p)}
              onWorkspaceTrustChanged={() =>
                setWorkspaceTrustNonce((nonce: number) => nonce + 1)
              }
            />
          </div>
        )}

        {spotifyPlayerOpen &&
          canShowSpotify &&
          spotifyState.status?.connected && (
            <React.Suspense fallback={null}>
              <SpotifyFloatingPlayer
                playback={spotifyState.playback}
                onPlay={spotifyActions.play}
                onPause={spotifyActions.pause}
                onNext={spotifyActions.next}
                onPrevious={spotifyActions.previous}
                onSeek={spotifyActions.seek}
                onSetVolume={spotifyActions.setVolume}
                onSetShuffle={spotifyActions.setShuffle}
                onSetRepeat={spotifyActions.setRepeat}
                devices={spotifyState.devices}
                selectedDeviceId={spotifyState.selectedDeviceId}
                loadingDevices={spotifyState.loadingDevices}
                onSelectDevice={spotifyActions.selectDevice}
                onRefreshDevices={spotifyActions.refreshDevices}
                onClose={() => setSpotifyPlayerOpen(false)}
              />
            </React.Suspense>
          )}

        <div
          className="relative flex flex-col flex-1 overflow-hidden"
          style={{ order: editorOrder }}
        >
          {chromeMounted && (
            <div
              className="axon-zen-chrome flex items-center border-b pr-1"
              style={
                {
                  background: "var(--axon-toolbar-background)",
                  borderColor: "var(--axon-panel-border)",
                  WebkitAppRegion: "drag",
                } as React.CSSProperties
              }
            >
              {platform !== "darwin" ? (
                <AppMenuButton
                  autoSaveEnabled={settings.editor.autoSave}
                  hasWorkspace={!!folderPath}
                  onCommand={runCommand}
                />
              ) : null}
              <div className="flex min-w-0 flex-1 overflow-hidden" />
              <div
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              >
                <EditorToolbar
                  onNewFile={() => runCommand(AXON_COMMANDS.NEW_FILE)}
                  onOpenFile={() =>
                    runCommand(AXON_COMMANDS.OPEN_COMMAND_PALETTE)
                  }
                  onDiff={() => runCommand(AXON_COMMANDS.OPEN_DIFF_VIEW)}
                  onNewTerminal={() => runCommand(AXON_COMMANDS.NEW_TERMINAL)}
                  onSplit={handleSplit}
                  onZenMode={() => runCommand(AXON_COMMANDS.TOGGLE_ZEN_MODE)}
                  onSettings={() => runCommand(AXON_COMMANDS.OPEN_SETTINGS)}
                  onExtensions={() => runCommand(AXON_COMMANDS.OPEN_EXTENSIONS)}
                  onAbout={() => setAboutOpen(true)}
                  updateInfo={updateInfo}
                  updateInstallState={updateInstallState}
                  onOpenUpdate={() => setUpdateModalOpen(true)}
                  isZenMode={zenMode}
                  hasWorkspace={!!folderPath}
                  hasActiveFile={!!activePane?.activeFile}
                />
              </div>
              {platform === "win32" ? (
                <div className="w-[138px] shrink-0" aria-hidden="true" />
              ) : null}
            </div>
          )}

          {settingsHydrated ? (
            <EditorPane
              layout={layout}
              language={language}
              availableFonts={availableFonts}
              extensionState={extensionState}
              settings={settings}
              folderPath={folderPath}
              onActivatePane={(id) =>
                setLayout((prev) => activatePane(prev, id))
              }
              onSelectFile={(paneId, f) =>
                setLayout((prev) => openFileInPane(prev, paneId, f))
              }
              onCloseTab={(paneId, f) => void requestCloseTab(paneId, f)}
              onPinTab={(paneId, f, pinned) =>
                setLayout((prev) => setPinnedInPane(prev, paneId, f, pinned))
              }
              onReorderTabs={(paneId, tabs) =>
                setLayout((prev) => reorderTabsInPane(prev, paneId, tabs))
              }
              onDirtyChange={(paneId, f, d) =>
                setLayout((prev) => setDirtyInPane(prev, paneId, f, d))
              }
              onCursorChange={(line, col) => setCursorInfo({ line, col })}
              onLanguageChange={setLanguage}
              onMoveTabBetweenPanes={(f, src, tgt) =>
                setLayout((prev) => moveTabBetweenPanes(prev, src, tgt, f))
              }
              onClosePane={(paneId) =>
                setLayout((prev) => closePane(prev, paneId))
              }
              onOpenAgent={() => runCommand(AXON_COMMANDS.ASK_AXON)}
              onOpenTabInTerminal={handleOpenTabInTerminal}
              onOpenFile={handleFileSelect}
              onOpenSettings={() => runCommand(AXON_COMMANDS.OPEN_SETTINGS)}
              onOpenTerminal={() => {
                runCommand(AXON_COMMANDS.TOGGLE_TERMINAL);
              }}
              onSelectTheme={(themeId: ThemeId) => {
                void handleSettingsSave(
                  {
                    ...settings,
                    editor: {
                      ...settings.editor,
                      themeId,
                    },
                  },
                  { announce: false },
                );
              }}
              onPreviewSettings={handleSettingsPreview}
              onSaveSettings={handleSettingsSave}
              onOpenLanguageTools={() => setLanguageToolsOpen(true)}
              onViewLogs={() => {
                setBottomPanelTab("output");
                setBottomPanelOpen(true);
                setTerminalOpen(false);
              }}
              onOpenNavigationTarget={handleOpenNavigationTarget}
              editorSettings={settings.editor}
              languageServicesEnabled={settings.lsp.enabled && workspaceTrusted}
              currentThemeId={settings.editor.themeId}
              themeItems={welcomeThemeItems}
              themeSyntax={themeSyntax}
              themeTokens={themeTokens}
              navigationTarget={navigationTarget}
              gitChanges={gitStatus?.changes ?? []}
              isGitRepository={gitStatus?.isRepository ?? false}
              diagnostics={diagnostics}
              deletedFiles={deletedFiles}
              handleOpenFolder={() => setFolderPickerIntent("folder")}
              handleNewFile={handleNewFile}
              handleFolderChange={handleFolderChange}
              nativeControlInset={zenNativeControlInset}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center bg-[var(--axon-editor-background)] text-[12px] text-[var(--axon-editor-foreground)] opacity-55">
              loading editor...
            </div>
          )}

          {workspaceTrusted && terminalContribution ? (
            <React.Suspense fallback={null}>
              <Terminal
                open={terminalOpen}
                createNonce={terminalCreateNonce}
                createWorkingDirectory={terminalCreateWorkingDirectory}
                editorSettings={settings.editor}
                terminalSettings={settings.terminal}
                terminalColors={terminalColors}
                themeTokens={themeTokens}
                workingDirectory={folderPath}
                activePanelTab={bottomPanelOpen ? bottomPanelTab : "terminal"}
                outputEntries={outputEntries}
                contribution={terminalContribution}
                onActivePanelTabChange={(tab) => {
                  if (tab === "terminal") {
                    setBottomPanelOpen(false);
                    setTerminalOpen(true);
                    return;
                  }
                  setBottomPanelTab(tab);
                  setBottomPanelOpen(true);
                  setTerminalOpen(false);
                }}
                onHide={() => {
                  setTerminalOpen(false);
                  setBottomPanelOpen(false);
                }}
                onClearOutput={() => runCommand(AXON_COMMANDS.CLEAR_OUTPUT)}
                nativeControlInset={terminalNativeControlInset}
              />
            </React.Suspense>
          ) : null}
        </div>

        {agentSidebarNode ? (
          <div className="flex shrink-0" style={{ order: agentSidebarOrder }}>
            {agentSidebarNode}
          </div>
        ) : null}
      </div>

      {chromeMounted && (
        <div className="axon-zen-chrome">
          <WorkbenchStatusBar visible={chromeMounted} {...props} />
        </div>
      )}

      {zenActive && <ZenCommandLine />}

      <WorkbenchOverlays {...props} />

      <WorkspaceSafetyOverlays {...props} />
    </div>
  );
}
