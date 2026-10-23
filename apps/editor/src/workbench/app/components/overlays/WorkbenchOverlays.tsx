/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from "react";
import { AXON_COMMANDS } from "../../../../shared/commands/commands";
import { AXON_ZEN_WORKSPACE_TREE_EVENT } from "../../../../shared/commands/zenWorkspaceTree";
import { AXON_GIT_GRAPH_TAB_PATH } from "@axon-builtin-git/git/lib/gitGraphTab";
import { getFileBackedTabPath } from "../../../../renderer/features/editor/lib/layout/navigation/tabIdentity";
import type { AxonWorkbenchLayoutProps } from "../../AxonAppView";

const CommandPalette = React.lazy(
  () => import("@axon-builtin-search/CommandPalette"),
);
const WorkspaceSearchModal = React.lazy(
  () => import("@axon-builtin-search/WorkspaceSearchModal"),
);
const FileOutlineModal = React.lazy(
  () => import("@axon-builtin-search/FileOutlineModal"),
);
const DiffModal = React.lazy(() => import("@axon-builtin-git/git/dialogs/DiffModal"));
const SourceControlModal = React.lazy(
  () => import("@axon-builtin-git/git/dialogs/SourceControlModal"),
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
const ExtensionsModal = React.lazy(() => import("../../../contrib/extensions"));
const AboutModal = React.lazy(
  () => import("../../../../renderer/shared/components/modals/AboutModal"),
);
const WorkspaceOverviewModal = React.lazy(
  () => import("../../../../renderer/features/workspace/WorkspaceOverviewModal"),
);
const ZenWorkspaceTreeModal = React.lazy(
  () =>
    import(
      "../../../../renderer/features/workspace/zen-tree/ZenWorkspaceTreeModal"
    ),
);
const UpdateModal = React.lazy(
  () => import("../../../../renderer/features/updates/UpdateModal"),
);
const ExtensionViewModal = React.lazy(
  () => import("../../../contrib/extensions/views/ExtensionViewModal"),
);

export default function WorkbenchOverlays(props: AxonWorkbenchLayoutProps) {
  const {
    aboutOpen,
    activeFileSymbols,
    activePane,
    activeRootId,
    appendOutput,
    diagnostics,
    diffFilePath,
    diffOpen,
    extensionState,
    extensionViewOpenId,
    extensionsOpen,
    fileOutlineOpen,
    folderPath,
    gitStatus,
    gitContribution,
    handleDownloadUpdate,
    handleFileSelect,
    handleInstallUpdate,
    handleOpenNavigationTarget,
    handleOpenExtensionWebview,
    handleOpenUpdatePage,
    handleRunWorkspaceTask,
    handleSwitchWorkspaceRoot,
    handleWorkspaceSearchResult,
    language,
    languageToolsContribution,
    languageToolsOpen,
    loading,
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
    setSourceControlOpen,
    setTaskRunnerOpen,
    setTerminalOpen,
    setTestExplorerOpen,
    setUpdateModalOpen,
    setWorkspaceOverviewOpen,
    setWorkspaceSearchOpen,
    settings,
    sourceControlOpen,
    taskRunnerOpen,
    tasksContribution,
    testExplorerOpen,
    testingContribution,
    themeSyntax,
    themeTokens,
    tree,
    updateInfo,
    updateInstallState,
    updateModalOpen,
    workspaceOverviewOpen,
    workspaceRoots,
    workspaceSearchOpen,
    zenMode,
  } = props;

  const [zenTreeOpen, setZenTreeOpen] = React.useState(false);

  React.useEffect(() => {
    const toggle = () => {
      if (!zenMode) return;

      // Cmd+B should close this tree when it is already open, but it should not
      // stack the tree on top of a command palette or another modal.
      if (!zenTreeOpen && document.querySelector(".axon-modal-overlay")) return;

      setZenTreeOpen((open) => !open);
    };

    window.addEventListener(AXON_ZEN_WORKSPACE_TREE_EVENT, toggle);
    return () =>
      window.removeEventListener(AXON_ZEN_WORKSPACE_TREE_EVENT, toggle);
  }, [zenMode, zenTreeOpen]);

  React.useEffect(() => {
    if (!zenMode) setZenTreeOpen(false);
  }, [zenMode]);

  React.useEffect(() => {
    if (paletteOpen) setZenTreeOpen(false);
  }, [paletteOpen]);

  const diffTarget = getFileBackedTabPath(
    diffFilePath ?? activePane?.activeFile ?? null,
  );

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

        {zenTreeOpen && (
          <ZenWorkspaceTreeModal
            tree={tree}
            folderPath={folderPath}
            activeFile={activePane?.activeFile ?? null}
            gitChanges={gitStatus?.changes ?? []}
            ignoredPaths={gitStatus?.ignoredPaths ?? []}
            loading={loading}
            onClose={() => setZenTreeOpen(false)}
            onFileSelect={handleFileSelect}
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

        {extensionsOpen && (
          <ExtensionsModal
            folderPath={folderPath}
            extensionState={extensionState}
            onExtensionsChanged={setExtensionState}
            onOpenWebview={handleOpenExtensionWebview}
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

        {diffOpen && diffTarget && (
          <DiffModal
            filePath={diffTarget}
            folderPath={folderPath}
            editorSettings={settings.editor}
            themeSyntax={themeSyntax}
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
            status={gitStatus}
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
            onGitStatusChanged={() => refreshGitStatus({ silent: true })}
            editorSettings={settings.editor}
            themeSyntax={themeSyntax}
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
