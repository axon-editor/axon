import * as React from "react";
import Terminal from "@axon-builtin-terminal/Terminal";
import { resolveTerminalWorkbenchContribution } from "@axon-builtin-terminal/lib/contribution";
import AxonAgentSidebar from "@axon-builtin-agent/AxonAgentSidebar";
import { resolveAgentWorkbenchContribution } from "@axon-builtin-agent/lib/contribution";
import CommandPalette from "@axon-builtin-search/CommandPalette";
import WorkspaceSearchModal from "@axon-builtin-search/WorkspaceSearchModal";
import FileOutlineModal from "@axon-builtin-search/FileOutlineModal";
import { resolveSearchWorkbenchContribution } from "@axon-builtin-search/lib/contribution";
import DiffModal from "@axon-builtin-git/git/DiffModal";
import SourceControlModal from "@axon-builtin-git/git/SourceControlModal";
import GitHistoryEditor from "@axon-builtin-git/git/GitHistoryEditor";
import { resolveGitWorkbenchContribution } from "@axon-builtin-git/lib/contribution";
import SettingsModal from "@axon-builtin-settings/settings/SettingsModal";
import { resolveSettingsWorkbenchContribution } from "@axon-builtin-settings/lib/contribution";
import TestExplorerModal from "@axon-builtin-testing/TestExplorerModal";
import Sidebar, { setWorkspaceTrusted } from "../../renderer/features/sidebar";
import EditorPane from "../../renderer/features/editor/EditorPane";
import StatusBar from "../../renderer/shared/components/StatusBar";
import EditorToolbar from "../../renderer/features/editor/EditorToolbar";
import ExtensionsModal from "../contrib/extensions";
import AboutModal from "../../renderer/shared/components/AboutModal";
import TaskRunnerModal from "../../renderer/features/tasks/TaskRunnerModal";
import WorkspaceOverviewModal from "../../renderer/features/workspace/WorkspaceOverviewModal";
import LanguageToolsModal from "../../renderer/features/lsp/LanguageToolsModal";
import UpdateModal from "../../renderer/features/updates/UpdateModal";
import WorkspaceLoadingOverlay from "../../renderer/shared/components/WorkspaceLoadingOverlay";
import SpotifyFloatingPlayer from "../../renderer/features/spotify/SpotifyFloatingPlayer";
import CliToolInstallPrompt from "../../renderer/features/cli/CliToolInstallPrompt";
import ExtensionViewModal from "../contrib/extensions/views/ExtensionViewModal";
import { AXON_COMMANDS } from "../../shared/commands";
import { type ThemeId } from "../../shared/settings";
import {
  closePane,
  moveTabBetweenPanes,
  openFileInPane,
  removePathFromLayout,
  reorderTabsInPane,
  replacePathInLayout,
  setDirtyInPane,
  setPinnedInPane,
} from "../../renderer/features/editor/lib/layoutManager";
import { detectLanguage } from "../../renderer/features/editor/lib/monacoModels";
import { fontStack } from "../../renderer/shared/lib/fonts";
import { getPathBasename } from "./lib/appPath";

export function AxonAppView(props: Record<string, any>) {
  const {
    activeFileContent,
    activeFileSymbols,
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
    cliToolInstallPrompt,
    cursorInfo,
    deletedFiles,
    diagnosticCounts,
    diagnostics,
    diffFilePath,
    diffOpen,
    extensionState,
    extensionViewOpenId,
    extensionsOpen,
    fileOutlineOpen,
    folderPath,
    folderPickerOpen,
    gitChangeCount,
    gitHistoryEditor,
    gitStatus,
    handleApplyAgentEdit,
    handleDownloadUpdate,
    handleFileSelect,
    handleFolderChange,
    handleNewFile,
    handleOpenDiagnostic,
    handleOpenFolder,
    handleOpenHtmlPreview,
    handleOpenNavigationTarget,
    handleOpenPathInTerminal,
    handleOpenTabInTerminal,
    handleOpenUpdatePage,
    handleRefresh,
    handleRunWorkspaceTask,
    handleSettingsPreview,
    handleSettingsSave,
    handleSplit,
    handleSwitchWorkspaceRoot,
    language,
    languageToolsOpen,
    layout,
    loading,
    navigationTarget,
    outputEntries,
    paletteCommands,
    paletteOpen,
    platform,
    requestCloseTab,
    runCommand,
    settings,
    settingsHydrated,
    settingsOpen,
    sidebarCollapsed,
    sidebarView,
    sidebarWidth,
    sourceControlOpen,
    spotifyActions,
    spotifyPlayerOpen,
    spotifyState,
    taskRunnerOpen,
    terminalCreateNonce,
    terminalCreateWorkingDirectory,
    terminalOpen,
    testExplorerOpen,
    themeTokens,
    tree,
    updateInfo,
    updateInstallState,
    updateModalOpen,
    workspaceOverviewOpen,
    workspaceRoots,
    workspaceSearchOpen,
    workspaceTrusted,
    workspaceTrustPromptPath,
    zenMode,
    aboutOpen,
    appendOutput,
    handleInstallUpdate,
    handleWorkspaceSearchResult,
    refreshGitStatus,
    setAboutOpen,
    setAgentSidebarOpen,
    setBottomPanelOpen,
    setBottomPanelTab,
    setDiffFilePath,
    setDiffOpen,
    setExtensionsOpen,
    setExtensionState,
    setExtensionViewOpenId,
    setFileOutlineOpen,
    setFolderPickerOpen,
    setGitHistoryEditor,
    setLanguage,
    setLanguageToolsOpen,
    setLayout,
    setPaletteOpen,
    setSettingsOpen,
    setSidebarCollapsed,
    setSidebarView,
    setSidebarWidth,
    setSourceControlOpen,
    setSpotifyPlayerOpen,
    setTaskRunnerOpen,
    setTerminalOpen,
    setTestExplorerOpen,
    setUpdateModalOpen,
    setWorkspaceOverviewOpen,
    setWorkspaceSearchOpen,
    setWorkspaceTrustNonce,
    setWorkspaceTrustPromptPath,
    setCursorInfo,
    setZenMode
  } = props;
  const welcomeThemeItems = React.useMemo(
    () =>
      (extensionState?.extensions ?? [])
        .filter((extension: any) => extension.source === "internal")
        .flatMap((extension: any) => extension.themes ?? [])
        .slice(0, 12)
        .map((theme: any) => ({
          id: theme.id,
          label: theme.label,
          source: theme.extensionName,
        })),
    [extensionState],
  );
  const [agentSidebarWidth, setAgentSidebarWidth] = React.useState(460);
  const terminalContribution = React.useMemo(
    () => resolveTerminalWorkbenchContribution(extensionState),
    [extensionState],
  );
  const agentContribution = React.useMemo(
    () => resolveAgentWorkbenchContribution(extensionState),
    [extensionState],
  );
  const searchContribution = React.useMemo(
    () => resolveSearchWorkbenchContribution(extensionState),
    [extensionState],
  );
  const settingsContribution = React.useMemo(
    () => resolveSettingsWorkbenchContribution(extensionState),
    [extensionState],
  );
  const gitContribution = React.useMemo(
    () => resolveGitWorkbenchContribution(extensionState),
    [extensionState],
  );
  const mainSidebarSide =
    settings.editor.sidebarSide === "right" ? "right" : "left";
  const shouldShowAgentSidebar =
    !zenMode && settings.ai.enabled && agentSidebarOpen && !!agentContribution;
  const agentSidebarNode = shouldShowAgentSidebar ? (
    <AxonAgentSidebar
      activeFileContent={activeFileContent}
      activeFileLanguage={
        activePane?.activeFile ? detectLanguage(activePane.activeFile) : "plaintext"
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

  return (
    <div
      className="axon-app-root relative flex h-full w-full flex-col overflow-hidden"
      style={{
        ...appThemeCssVariables,
        background: "var(--axon-background)",
        backdropFilter:
          settings.editor.appTransparency &&
          settings.editor.appBackgroundBlur > 0
            ? `blur(${settings.editor.appBackgroundBlur}px)`
            : undefined,
        WebkitBackdropFilter:
          settings.editor.appTransparency &&
          settings.editor.appBackgroundBlur > 0
            ? `blur(${settings.editor.appBackgroundBlur}px)`
            : undefined,
        fontFamily: fontStack(
          settings.editor.uiFontFamily,
          "system-ui, sans-serif",
        ),
        fontWeight: settings.editor.fontWeight,
        letterSpacing: 0,
      }}
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
                setGitHistoryEditor({ commit, file, diff });
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

        {spotifyPlayerOpen && spotifyState.status?.connected && (
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

          {gitHistoryEditor && gitContribution ? (
            <GitHistoryEditor
              commit={gitHistoryEditor.commit}
              file={gitHistoryEditor.file}
              diff={gitHistoryEditor.diff}
              editorSettings={settings.editor}
              themeTokens={themeTokens}
              onClose={() => setGitHistoryEditor(null)}
            />
          ) : settingsHydrated ? (
            <EditorPane
              layout={layout}
              folderPath={folderPath}
              onActivatePane={(id) =>
                setLayout((prev: any) => ({ ...prev, activePaneId: id }))
              }
              onSelectFile={(paneId, f) =>
                setLayout((prev: any) => openFileInPane(prev, paneId, f))
              }
              onCloseTab={(paneId, f) => void requestCloseTab(paneId, f)}
              onPinTab={(paneId, f, pinned) =>
                setLayout((prev: any) => setPinnedInPane(prev, paneId, f, pinned))
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
              currentThemeId={settings.editor.themeId}
              themeItems={welcomeThemeItems}
              themeTokens={themeTokens}
              navigationTarget={navigationTarget}
              gitChanges={gitStatus?.changes ?? []}
              deletedFiles={deletedFiles}
              handleOpenFolder={handleOpenFolder}
              handleNewFile={handleNewFile}
              handleFolderChange={handleFolderChange}
              nativeControlInset={zenNativeControlInset}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center bg-[var(--axon-editor-background)] text-[12px] text-[#586478]">
              loading editor...
            </div>
          )}

          {workspaceTrusted && terminalContribution ? (
            <Terminal
              open={terminalOpen && !zenMode}
              createNonce={terminalCreateNonce}
              createWorkingDirectory={terminalCreateWorkingDirectory}
              editorSettings={settings.editor}
              themeTokens={themeTokens}
              workingDirectory={folderPath}
              activePanelTab={
                !zenMode && bottomPanelOpen ? bottomPanelTab : "terminal"
              }
              diagnostics={diagnostics}
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
              onOpenDiagnostic={handleOpenDiagnostic}
              onRefreshDiagnostics={() =>
                runCommand(AXON_COMMANDS.REFRESH_DIAGNOSTICS)
              }
              onClearOutput={() => runCommand(AXON_COMMANDS.CLEAR_OUTPUT)}
            />
          ) : null}
        </div>

        {agentSidebarNode ? (
          <div className="flex shrink-0" style={{ order: agentSidebarOrder }}>
            {agentSidebarNode}
          </div>
        ) : null}
      </div>

      {!zenMode && (
        <StatusBar
          activeFile={activePane?.activeFile ?? null}
          hasWorkspace={!!folderPath}
          language={language}
          cursor={cursorInfo}
          sidebarCollapsed={sidebarCollapsed}
          terminalOpen={terminalOpen}
          aiEnabled={settings.ai.enabled}
          agentSidebarOpen={agentSidebarOpen}
          bottomPanelOpen={bottomPanelOpen}
          bottomPanelTab={bottomPanelTab}
          problemCount={diagnosticCounts.total}
          errorCount={diagnosticCounts.error}
          warningCount={diagnosticCounts.warning}
          gitBranch={gitStatus?.branch ?? null}
          gitChangeCount={gitChangeCount}
          themeTokens={themeTokens}
          onToggleSidebar={() => setSidebarCollapsed((p: boolean) => !p)}
          onOpenWorkspaceSearch={() =>
            runCommand(AXON_COMMANDS.OPEN_WORKSPACE_SEARCH)
          }
          onToggleTerminal={() => runCommand(AXON_COMMANDS.TOGGLE_TERMINAL)}
          onToggleAgentSidebar={() => setAgentSidebarOpen((open: boolean) => !open)}
          onOpenBottomPanel={(tab) =>
            runCommand(
              tab === "problems"
                ? AXON_COMMANDS.OPEN_PROBLEMS_PANEL
                : AXON_COMMANDS.OPEN_OUTPUT_PANEL,
            )
          }
          onOpenSourceControl={() =>
            runCommand(AXON_COMMANDS.OPEN_SOURCE_CONTROL)
          }
          onOpenTests={() => runCommand(AXON_COMMANDS.OPEN_TEST_EXPLORER)}
          view={sidebarView}
          onViewChange={(nextView) => {
            if (nextView === "history") {
              runCommand(AXON_COMMANDS.OPEN_GIT_HISTORY);
            } else {
              setSidebarView(nextView);
            }
            setSidebarCollapsed(false);
          }}
        />
      )}

      <CommandPalette
        tree={tree}
        folderPath={folderPath}
        open={paletteOpen}
        commands={paletteCommands}
        onClose={() => setPaletteOpen(false)}
        onFileSelect={handleFileSelect}
        onCommandSelect={runCommand}
      />

      {searchContribution && (
        <WorkspaceSearchModal
          rootPath={folderPath}
          open={workspaceSearchOpen}
          onClose={() => setWorkspaceSearchOpen(false)}
          onResultSelect={handleWorkspaceSearchResult}
        />
      )}

      <WorkspaceOverviewModal
        open={workspaceOverviewOpen}
        roots={workspaceRoots}
        activeRootId={activeRootId}
        diagnostics={diagnostics}
        onClose={() => setWorkspaceOverviewOpen(false)}
        onSwitchRoot={(path) => {
          void handleSwitchWorkspaceRoot(path);
        }}
        onOpenTests={() => {
          setWorkspaceOverviewOpen(false);
          runCommand(AXON_COMMANDS.OPEN_TEST_EXPLORER);
        }}
      />

      <TaskRunnerModal
        folderPath={folderPath}
        open={taskRunnerOpen}
        onClose={() => setTaskRunnerOpen(false)}
        onRunTask={(task) => void handleRunWorkspaceTask(task)}
      />

      <TestExplorerModal
        folderPath={folderPath}
        open={testExplorerOpen}
        onClose={() => setTestExplorerOpen(false)}
        onOutput={(message, level = "info") =>
          appendOutput("tests", message, level)
        }
      />

      <FileOutlineModal
        open={fileOutlineOpen}
        filePath={activePane?.activeFile ?? null}
        symbols={activeFileSymbols}
        onClose={() => setFileOutlineOpen(false)}
        onSelect={(symbol) => {
          const activeFile = activePane?.activeFile;
          if (!activeFile) return;
          handleOpenNavigationTarget({
            path: activeFile,
            line: symbol.line,
            column: symbol.column,
            length: Math.max(1, symbol.name.length),
          });
        }}
      />

      <LanguageToolsModal
        open={languageToolsOpen}
        folderPath={folderPath}
        activeFile={activePane?.activeFile ?? null}
        language={language}
        symbols={activeFileSymbols}
        onClose={() => setLanguageToolsOpen(false)}
        onGoToDefinition={() => runCommand(AXON_COMMANDS.GO_TO_DEFINITION)}
        onFindReferences={() => runCommand(AXON_COMMANDS.FIND_REFERENCES)}
        onRename={() => runCommand(AXON_COMMANDS.RENAME_SYMBOL)}
        onFormat={() => runCommand(AXON_COMMANDS.FORMAT_DOCUMENT)}
        onOpenOutline={() => {
          setLanguageToolsOpen(false);
          setFileOutlineOpen(true);
        }}
      />

      {settingsOpen && settingsContribution && (
        <SettingsModal
          folderPath={folderPath}
          workspaceTrusted={workspaceTrusted}
          availableFonts={availableFonts}
          extensionState={extensionState}
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onPreview={handleSettingsPreview}
          onSave={handleSettingsSave}
          onViewLogs={() => {
            setSettingsOpen(false);
            setBottomPanelTab("output");
            setBottomPanelOpen(true);
            setTerminalOpen(false);
          }}
        />
      )}

      {extensionsOpen && (
        <ExtensionsModal
          folderPath={folderPath}
          extensionState={extensionState}
          onExtensionsChanged={setExtensionState}
          onClose={() => setExtensionsOpen(false)}
        />
      )}

      <ExtensionViewModal
        extensionState={extensionState}
        viewId={extensionViewOpenId}
        onClose={() => setExtensionViewOpenId(null)}
      />

      {aboutOpen && (
        <AboutModal
          updateInfo={updateInfo}
          onOpenUpdatePage={() => setUpdateModalOpen(true)}
          onClose={() => setAboutOpen(false)}
        />
      )}

      {updateModalOpen && updateInfo && (
        <UpdateModal
          updateInfo={updateInfo}
          installState={updateInstallState}
          onClose={() => setUpdateModalOpen(false)}
          onDownloadUpdate={handleDownloadUpdate}
          onInstallUpdate={handleInstallUpdate}
          onOpenUpdatePage={handleOpenUpdatePage}
        />
      )}

      {diffOpen && (diffFilePath || activePane?.activeFile) && (
        <DiffModal
          filePath={diffFilePath ?? activePane?.activeFile ?? ""}
          folderPath={folderPath}
          editorSettings={settings.editor}
          themeTokens={themeTokens}
          onClose={() => {
            setDiffOpen(false);
            setDiffFilePath(null);
          }}
        />
      )}

      {gitContribution && (
        <SourceControlModal
          folderPath={folderPath}
          open={sourceControlOpen}
          onClose={() => setSourceControlOpen(false)}
          onOpenFile={handleFileSelect}
          onOpenDiff={(path) => {
            setDiffFilePath(path);
            setDiffOpen(true);
          }}
          onGitStatusChanged={() => void refreshGitStatus({ silent: true })}
          editorSettings={settings.editor}
          themeTokens={themeTokens}
          onOutput={(message, level = "info") =>
            appendOutput("git", message, level)
          }
        />
      )}

      {workspaceTrustPromptPath && (
        <div className="axon-modal-overlay fixed inset-0 z-[80] flex items-center justify-center px-4">
          <div className="axon-modal-panel w-full max-w-md rounded-xl border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.48)]">
            <div className="text-[14px] font-medium text-[var(--axon-editor-foreground)]">
              Trust this workspace?
            </div>
            <div className="mt-2 text-[12px] leading-5 text-[var(--axon-editor-foreground)] opacity-65">
              Axon can run project-aware features for{" "}
              <span className="font-medium text-[var(--axon-editor-foreground)]">
                {getPathBasename(workspaceTrustPromptPath)}
              </span>
              , including language servers, tasks, terminals, and extensions.
              Only trust folders you recognize.
            </div>
            <div className="mt-3 truncate rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-3 py-2 font-mono text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
              {workspaceTrustPromptPath}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setWorkspaceTrusted(workspaceTrustPromptPath, false);
                  setWorkspaceTrustNonce((nonce: number) => nonce + 1);
                  setWorkspaceTrustPromptPath(null);
                  appendOutput("workspace", "Workspace marked untrusted.");
                }}
                className="h-8 cursor-pointer rounded-md border border-[var(--axon-panel-border)] px-3 text-[12px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
              >
                Don&apos;t trust
              </button>
              <button
                type="button"
                onClick={() => {
                  setWorkspaceTrusted(workspaceTrustPromptPath, true);
                  setWorkspaceTrustNonce((nonce: number) => nonce + 1);
                  setWorkspaceTrustPromptPath(null);
                  appendOutput("workspace", "Workspace trusted.", "success");
                }}
                className="h-8 cursor-pointer rounded-md border border-[var(--axon-syntax-function)] bg-[var(--axon-panel-overlay-hover)] px-3 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:text-[var(--axon-syntax-function)]"
              >
                Trust workspace
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && <WorkspaceLoadingOverlay />}
      <CliToolInstallPrompt prompt={cliToolInstallPrompt} />
    </div>
  );
}
