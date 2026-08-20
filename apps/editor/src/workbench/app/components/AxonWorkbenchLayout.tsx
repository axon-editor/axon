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
import { openGitCommitDiff } from "@axon-builtin-git/git/lib/gitGraphTab";

const Terminal = React.lazy(() => import("@axon-builtin-terminal/Terminal"));
const AxonAgentSidebar = React.lazy(
  () => import("@axon-builtin-agent/AxonAgentSidebar"),
);
const SpotifyFloatingPlayer = React.lazy(
  () => import("@axon-builtin-spotify/SpotifyFloatingPlayer"),
);

export default function AxonWorkbenchLayout(props: Record<string, any>) {
  const {
    activeFileContent,
    activePane,
    activeRootId,
    agentActionRequest,
    agentResumeRequest,
    agentResumeRequested,
    agentSidebarOpen,
    appThemeCssVariables,
    bottomPanelOpen,
    bottomPanelTab,
    deletedFiles,
    diagnostics,
    folderPath,
    folderPickerOpen,
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
    handleSettingsSave,
    handleSplit,
    handleSwitchWorkspaceRoot,
    layout,
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
    terminalOpen,
    themeSyntax,
    themeTokens,
    tree,
    updateInfo,
    updateInstallState,
    workspaceRoots,
    workspaceTrusted,
    zenMode,
    setAboutOpen,
    setAgentSidebarOpen,
    setBottomPanelOpen,
    setBottomPanelTab,
    setFolderPickerOpen,
    setLanguage,
    setLayout,
    setSidebarWidth,
    setSpotifyPlayerOpen,
    setTerminalOpen,
    setUpdateModalOpen,
    setWorkspaceTrustNonce,
    setCursorInfo,
    setZenMode,
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
  const shouldShowAgentSidebar =
    !zenMode && settings.ai.enabled && agentSidebarOpen && !!agentContribution;
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
  const zenNativeControlInset = zenMode
    ? {
        start: platform === "darwin" ? 92 : 0,
        end: platform === "win32" ? 150 : 0,
      }
    : undefined;
  const uiFontFamily = fontStack(
    settings.editor.uiFontFamily,
    "system-ui, sans-serif",
  );

  return (
    <div
      className="axon-app-root relative flex h-full w-full flex-col overflow-hidden"
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
      {zenMode && (
        <>
          <div
            className="absolute top-0 left-0 right-0 h-9 z-40"
            style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
          />
          <div
            className="absolute top-11 right-3 z-50"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <button
              onClick={() => setZenMode(false)}
              className="flex cursor-pointer items-center gap-1.5 rounded border px-2.5 py-1.5 text-[11px] text-[var(--axon-editor-foreground)] opacity-55 transition-colors hover:border-[var(--axon-syntax-function)] hover:opacity-100"
              style={{
                background: "var(--axon-panel-background)",
                borderColor: "var(--axon-panel-border)",
              }}
            >
              exit zen
            </button>
          </div>
        </>
      )}

      <div className={`flex flex-1 overflow-hidden ${zenMode ? "pt-9" : ""}`}>
        {!zenMode && (
          <div className="flex shrink-0" style={{ order: mainSidebarOrder }}>
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
              onOpenGitHistoryFile={(commit, file, diff) => {
                openGitCommitDiff({ commit, file, diff });
              }}
              onSplitFile={(filePath) => handleSplit("right", filePath)}
              onOpenInTerminal={handleOpenPathInTerminal}
              onOpenHtmlPreview={handleOpenHtmlPreview}
              onEntryDeleted={(path) =>
                setLayout((prev: any) => removePathFromLayout(prev, path))
              }
              onEntryMoved={(oldPath, newPath) =>
                setLayout((prev: any) =>
                  replacePathInLayout(prev, oldPath, newPath),
                )
              }
              onEntryRenamed={(oldPath, newPath) =>
                setLayout((prev: any) =>
                  replacePathInLayout(prev, oldPath, newPath),
                )
              }
              gitChanges={gitStatus?.changes ?? []}
              ignoredPaths={gitStatus?.ignoredPaths ?? []}
              folderPickerOpen={folderPickerOpen}
              onOpenFolderPicker={() => setFolderPickerOpen(true)}
              onCloseFolderPicker={() => setFolderPickerOpen(false)}
              platform={platform}
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
          {!zenMode && (
            <div
              className="flex items-center border-b pr-1"
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
              folderPath={folderPath}
              onActivatePane={(id) =>
                setLayout((prev: any) => activatePane(prev, id))
              }
              onSelectFile={(paneId, f) =>
                setLayout((prev: any) => openFileInPane(prev, paneId, f))
              }
              onCloseTab={(paneId, f) => void requestCloseTab(paneId, f)}
              onPinTab={(paneId, f, pinned) =>
                setLayout((prev: any) =>
                  setPinnedInPane(prev, paneId, f, pinned),
                )
              }
              onReorderTabs={(paneId, tabs) =>
                setLayout((prev: any) => reorderTabsInPane(prev, paneId, tabs))
              }
              onDirtyChange={(paneId, f, d) =>
                setLayout((prev: any) => setDirtyInPane(prev, paneId, f, d))
              }
              onCursorChange={(line, col) => setCursorInfo({ line, col })}
              onLanguageChange={setLanguage}
              onMoveTabBetweenPanes={(f, src, tgt) =>
                setLayout((prev: any) => moveTabBetweenPanes(prev, src, tgt, f))
              }
              onClosePane={(paneId) =>
                setLayout((prev: any) => closePane(prev, paneId))
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
              onOpenNavigationTarget={handleOpenNavigationTarget}
              editorSettings={settings.editor}
              languageServicesEnabled={settings.lsp.enabled && workspaceTrusted}
              currentThemeId={settings.editor.themeId}
              themeItems={welcomeThemeItems}
              themeSyntax={themeSyntax}
              themeTokens={themeTokens}
              navigationTarget={navigationTarget}
              gitChanges={gitStatus?.changes ?? []}
              diagnostics={diagnostics}
              deletedFiles={deletedFiles}
              handleOpenFolder={() => setFolderPickerOpen(true)}
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
                open={terminalOpen && !zenMode}
                createNonce={terminalCreateNonce}
                createWorkingDirectory={terminalCreateWorkingDirectory}
                editorSettings={settings.editor}
                terminalSettings={settings.terminal}
                themeTokens={themeTokens}
                workingDirectory={folderPath}
                activePanelTab={
                  !zenMode && bottomPanelOpen ? bottomPanelTab : "terminal"
                }
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

      <WorkbenchStatusBar {...props} />

      <WorkbenchOverlays {...props} />

      <WorkspaceSafetyOverlays {...props} />
    </div>
  );
}
