import * as React from "react";
import { AXON_COMMANDS } from "../../../shared/commands";
import { AXON_GIT_GRAPH_TAB_PATH } from "@axon-builtin-git/git/lib/gitGraphTab";

const CommandPalette = React.lazy(
  () => import("@axon-builtin-search/CommandPalette"),
);
const WorkspaceSearchModal = React.lazy(
  () => import("@axon-builtin-search/WorkspaceSearchModal"),
);
const FileOutlineModal = React.lazy(
  () => import("@axon-builtin-search/FileOutlineModal"),
);
const DiffModal = React.lazy(() => import("@axon-builtin-git/git/DiffModal"));
const SourceControlModal = React.lazy(
  () => import("@axon-builtin-git/git/SourceControlModal"),
);
const SettingsModal = React.lazy(
  () => import("@axon-builtin-settings/settings/SettingsModal"),
);
const TestExplorerModal = React.lazy(
  () => import("@axon-builtin-testing/TestExplorerModal"),
);
const TaskRunnerModal = React.lazy(
  () => import("@axon-builtin-tasks/TaskRunnerModal"),
);
const LanguageToolsModal = React.lazy(
  () => import("@axon-builtin-language-tools/LanguageToolsModal"),
);
const ExtensionsModal = React.lazy(() => import("../../contrib/extensions"));
const AboutModal = React.lazy(
  () => import("../../../renderer/shared/components/AboutModal"),
);
const WorkspaceOverviewModal = React.lazy(
  () => import("../../../renderer/features/workspace/WorkspaceOverviewModal"),
);
const UpdateModal = React.lazy(
  () => import("../../../renderer/features/updates/UpdateModal"),
);
const ExtensionViewModal = React.lazy(
  () => import("../../contrib/extensions/views/ExtensionViewModal"),
);

export default function WorkbenchOverlays(props: Record<string, any>) {
  const {
    aboutOpen,
    activeFileSymbols,
    activePane,
    activeRootId,
    appendOutput,
    availableFonts,
    diagnostics,
    diffFilePath,
    diffOpen,
    extensionState,
    extensionViewOpenId,
    extensionsOpen,
    fileOutlineOpen,
    folderPath,
    gitContribution,
    handleDownloadUpdate,
    handleFileSelect,
    handleInstallUpdate,
    handleOpenNavigationTarget,
    handleOpenUpdatePage,
    handleRunWorkspaceTask,
    handleSettingsPreview,
    handleSettingsSave,
    handleSwitchWorkspaceRoot,
    handleWorkspaceSearchResult,
    language,
    languageToolsContribution,
    languageToolsOpen,
    paletteCommands,
    paletteOpen,
    refreshGitStatus,
    runCommand,
    searchContribution,
    setAboutOpen,
    setBottomPanelOpen,
    setBottomPanelTab,
    setDiffFilePath,
    setDiffOpen,
    setExtensionState,
    setExtensionViewOpenId,
    setExtensionsOpen,
    setFileOutlineOpen,
    setLanguageToolsOpen,
    setPaletteOpen,
    setSettingsOpen,
    setSourceControlOpen,
    setTaskRunnerOpen,
    setTerminalOpen,
    setTestExplorerOpen,
    setUpdateModalOpen,
    setWorkspaceOverviewOpen,
    setWorkspaceSearchOpen,
    settings,
    settingsContribution,
    settingsOpen,
    sourceControlOpen,
    taskRunnerOpen,
    tasksContribution,
    testExplorerOpen,
    testingContribution,
    themeTokens,
    tree,
    updateInfo,
    updateInstallState,
    updateModalOpen,
    workspaceOverviewOpen,
    workspaceRoots,
    workspaceSearchOpen,
  } = props;

  return (
    <>
      <React.Suspense fallback={null}>
        {paletteOpen && (
          <CommandPalette
            tree={tree}
            folderPath={folderPath}
            open={paletteOpen}
            commands={paletteCommands}
            onClose={() => setPaletteOpen(false)}
            onFileSelect={handleFileSelect}
            onCommandSelect={runCommand}
          />
        )}

        {searchContribution && workspaceSearchOpen && (
          <WorkspaceSearchModal
            rootPath={folderPath}
            open={workspaceSearchOpen}
            onClose={() => setWorkspaceSearchOpen(false)}
            onResultSelect={handleWorkspaceSearchResult}
          />
        )}

        {workspaceOverviewOpen && (
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
        )}

        {tasksContribution && taskRunnerOpen && (
          <TaskRunnerModal
            folderPath={folderPath}
            open={taskRunnerOpen}
            onClose={() => setTaskRunnerOpen(false)}
            onRunTask={(task) => void handleRunWorkspaceTask(task)}
          />
        )}

        {testingContribution && testExplorerOpen && (
          <TestExplorerModal
            folderPath={folderPath}
            open={testExplorerOpen}
            onClose={() => setTestExplorerOpen(false)}
            onOutput={(message, level = "info") =>
              appendOutput("tests", message, level)
            }
          />
        )}

        {fileOutlineOpen && (
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
        )}

        {languageToolsContribution && languageToolsOpen && (
          <LanguageToolsModal
            open={languageToolsOpen}
            folderPath={folderPath}
            activeFile={activePane?.activeFile ?? null}
            language={language}
            onClose={() => setLanguageToolsOpen(false)}
            onViewLogs={() => {
              setLanguageToolsOpen(false);
              setBottomPanelTab("output");
              setBottomPanelOpen(true);
              setTerminalOpen(false);
            }}
          />
        )}

        {settingsOpen && settingsContribution && (
          <SettingsModal
            folderPath={folderPath}
            availableFonts={availableFonts}
            extensionState={extensionState}
            settings={settings}
            onClose={() => setSettingsOpen(false)}
            onPreview={handleSettingsPreview}
            onSave={handleSettingsSave}
            onOpenLanguageTools={() => {
              setSettingsOpen(false);
              setLanguageToolsOpen(true);
            }}
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

        {extensionViewOpenId && (
          <ExtensionViewModal
            extensionState={extensionState}
            viewId={extensionViewOpenId}
            onClose={() => setExtensionViewOpenId(null)}
          />
        )}

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

        {gitContribution && sourceControlOpen && (
          <SourceControlModal
            folderPath={folderPath}
            open={sourceControlOpen}
            onClose={() => setSourceControlOpen(false)}
            onOpenFile={handleFileSelect}
            onOpenDiff={(path) => {
              setDiffFilePath(path);
              setDiffOpen(true);
            }}
            onOpenGraph={() => {
              handleFileSelect(AXON_GIT_GRAPH_TAB_PATH);
              setSourceControlOpen(false);
            }}
            onGitStatusChanged={() => void refreshGitStatus({ silent: true })}
            editorSettings={settings.editor}
            themeTokens={themeTokens}
            onOutput={(message, level = "info") =>
              appendOutput("git", message, level)
            }
          />
        )}
      </React.Suspense>
    </>
  );
}
