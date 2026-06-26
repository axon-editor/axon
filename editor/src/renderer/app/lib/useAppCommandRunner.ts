import { useCallback } from "react";
import { AXON_COMMANDS, type AxonCommand } from "../../../shared/commands";
import { isHtmlFile } from "../../features/preview/lib/htmlPreviewTabs";

interface AppCommandRunnerOptions {
  activeFilePath: any;
  appendOutput: any;
  clearOutputEntries: any;
  handleCloseActiveTab: any;
  handleNewFile: any;
  handleNewTerminal: any;
  handleOpenFolder: any;
  handleOpenHtmlPreview: any;
  handleOpenSettingsJson: any;
  handleSaveActiveFile: any;
  navigateDiagnostic: any;
  refreshGitStatus: any;
  refreshProjectDiagnostics: any;
  requireTrustedWorkspace: any;
  runEditorAction: any;
  settings: any;
  terminalOpen: any;
  updateAvailable: any;
  setAboutOpen: any;
  setAgentActionRequest: any;
  setAgentSidebarOpen: any;
  setBottomPanelOpen: any;
  setBottomPanelTab: any;
  setDiffFilePath: any;
  setDiffOpen: any;
  setExtensionsOpen: any;
  setFileOutlineOpen: any;
  setLanguageToolsOpen: any;
  setPaletteOpen: any;
  setSettingsOpen: any;
  setSidebarCollapsed: any;
  setSidebarView: any;
  setSourceControlOpen: any;
  setTaskRunnerOpen: any;
  setTerminalOpen: any;
  setTestExplorerOpen: any;
  setUpdateModalOpen: any;
  setWorkspaceOverviewOpen: any;
  setWorkspaceSearchOpen: any;
  setZenMode: any;
}

export function useAppCommandRunner({
  activeFilePath,
  appendOutput,
  clearOutputEntries,
  handleCloseActiveTab,
  handleNewFile,
  handleNewTerminal,
  handleOpenFolder,
  handleOpenHtmlPreview,
  handleOpenSettingsJson,
  handleSaveActiveFile,
  navigateDiagnostic,
  refreshGitStatus,
  refreshProjectDiagnostics,
  requireTrustedWorkspace,
  runEditorAction,
  settings,
  terminalOpen,
  updateAvailable,
  setAboutOpen,
  setAgentActionRequest,
  setAgentSidebarOpen,
  setBottomPanelOpen,
  setBottomPanelTab,
  setDiffFilePath,
  setDiffOpen,
  setExtensionsOpen,
  setFileOutlineOpen,
  setLanguageToolsOpen,
  setPaletteOpen,
  setSettingsOpen,
  setSidebarCollapsed,
  setSidebarView,
  setSourceControlOpen,
  setTaskRunnerOpen,
  setTerminalOpen,
  setTestExplorerOpen,
  setUpdateModalOpen,
  setWorkspaceOverviewOpen,
  setWorkspaceSearchOpen,
  setZenMode,
}: AppCommandRunnerOptions) {
  return useCallback(
(command: AxonCommand) => {
      if (command.startsWith("extension:")) {
        if (!requireTrustedWorkspace("Extension commands")) return;

        const commandId = command.slice("extension:".length);
        appendOutput(
          "extensions",
          `Extension command '${commandId}' is registered. Executable extension hosts are intentionally disabled until the sandbox API is expanded.`,
          "warning",
        );
        return;
      }

      switch (command) {
        case AXON_COMMANDS.ABOUT:
          setAboutOpen(true);
          break;
        case AXON_COMMANDS.NEW_FILE:
          void handleNewFile();
          break;
        case AXON_COMMANDS.OPEN_FOLDER:
          void handleOpenFolder();
          break;
        case AXON_COMMANDS.SAVE:
          handleSaveActiveFile();
          break;
        case AXON_COMMANDS.CLOSE_TAB:
          handleCloseActiveTab();
          break;
        case AXON_COMMANDS.OPEN_COMMAND_PALETTE:
          setPaletteOpen((prev: boolean) => !prev);
          break;
        case AXON_COMMANDS.OPEN_WORKSPACE_OVERVIEW:
          setWorkspaceOverviewOpen(true);
          break;
        case AXON_COMMANDS.OPEN_WORKSPACE_SEARCH:
          setWorkspaceSearchOpen((prev: boolean) => !prev);
          break;
        case AXON_COMMANDS.OPEN_TASK_RUNNER:
          if (!requireTrustedWorkspace("Tasks")) break;
          setTaskRunnerOpen(true);
          break;
        case AXON_COMMANDS.OPEN_TEST_EXPLORER:
          if (!requireTrustedWorkspace("Tests")) break;
          setTestExplorerOpen(true);
          break;
        case AXON_COMMANDS.OPEN_FILE_OUTLINE:
          setFileOutlineOpen(true);
          break;
        case AXON_COMMANDS.OPEN_LANGUAGE_TOOLS:
          setLanguageToolsOpen(true);
          break;
        case AXON_COMMANDS.GO_TO_DEFINITION:
          if (!requireTrustedWorkspace("Language server navigation")) break;
          runEditorAction("definition");
          break;
        case AXON_COMMANDS.FIND_REFERENCES:
          if (!requireTrustedWorkspace("Language server navigation")) break;
          runEditorAction("references");
          break;
        case AXON_COMMANDS.RENAME_SYMBOL:
          if (!requireTrustedWorkspace("Language server features")) break;
          runEditorAction("rename");
          break;
        case AXON_COMMANDS.FORMAT_DOCUMENT:
          if (!requireTrustedWorkspace("Language server features")) break;
          runEditorAction("format");
          break;
        case AXON_COMMANDS.OPEN_HTML_PREVIEW:
          if (activeFilePath && isHtmlFile(activeFilePath)) {
            handleOpenHtmlPreview(activeFilePath);
          }
          break;
        case AXON_COMMANDS.OPEN_PROBLEMS_PANEL:
          setBottomPanelTab("problems");
          setBottomPanelOpen(true);
          setTerminalOpen(false);
          appendOutput("panel", "Opened Problems panel.");
          break;
        case AXON_COMMANDS.OPEN_OUTPUT_PANEL:
          setBottomPanelTab("output");
          setBottomPanelOpen(true);
          setTerminalOpen(false);
          appendOutput("panel", "Opened Output panel.");
          break;
        case AXON_COMMANDS.REFRESH_DIAGNOSTICS:
          if (!requireTrustedWorkspace("Language server diagnostics")) break;
          setBottomPanelTab("problems");
          setBottomPanelOpen(true);
          setTerminalOpen(false);
          void refreshProjectDiagnostics();
          break;
        case AXON_COMMANDS.NEXT_PROBLEM:
          navigateDiagnostic(1);
          break;
        case AXON_COMMANDS.PREVIOUS_PROBLEM:
          navigateDiagnostic(-1);
          break;
        case AXON_COMMANDS.CLEAR_OUTPUT:
          setBottomPanelTab("output");
          setBottomPanelOpen(true);
          setTerminalOpen(false);
          clearOutputEntries();
          break;
        case AXON_COMMANDS.OPEN_DIFF_VIEW:
          if (activeFilePath) {
            setDiffFilePath(activeFilePath);
            setDiffOpen(true);
          }
          break;
        case AXON_COMMANDS.OPEN_SOURCE_CONTROL:
          setSourceControlOpen(true);
          void refreshGitStatus();
          break;
        case AXON_COMMANDS.OPEN_GIT_HISTORY:
          setSidebarCollapsed(false);
          setSidebarView("history");
          void refreshGitStatus({ silent: true });
          break;
        case AXON_COMMANDS.TOGGLE_TERMINAL:
          if (!requireTrustedWorkspace("Terminal")) break;
          setBottomPanelOpen(false);
          setTerminalOpen((prev: boolean) => !prev);
          appendOutput(
            "terminal",
            terminalOpen ? "Hid terminal." : "Showed terminal.",
          );
          break;
        case AXON_COMMANDS.OPEN_SETTINGS:
          setSettingsOpen(true);
          break;
        case AXON_COMMANDS.OPEN_EXTENSIONS:
          if (!requireTrustedWorkspace("Extensions")) break;
          setExtensionsOpen(true);
          break;
        case AXON_COMMANDS.OPEN_SETTINGS_JSON:
          void handleOpenSettingsJson();
          break;
        case AXON_COMMANDS.OPEN_UPDATE_NOTES:
          if (updateAvailable) {
            setUpdateModalOpen(true);
          }
          break;
        case AXON_COMMANDS.ASK_AXON:
          if (!requireTrustedWorkspace("Ask Axon")) break;
          setAgentSidebarOpen(true);
          setAgentActionRequest({ action: "ask", nonce: Date.now() });
          break;
        case AXON_COMMANDS.AI_EXPLAIN_SELECTION:
          if (!requireTrustedWorkspace("Ask Axon")) break;
          setAgentSidebarOpen(true);
          setAgentActionRequest({
            action: "explain-selection",
            nonce: Date.now(),
          });
          break;
        case AXON_COMMANDS.AI_FIX_PROBLEM:
          if (!requireTrustedWorkspace("Ask Axon")) break;
          setAgentSidebarOpen(true);
          setAgentActionRequest({ action: "fix-problem", nonce: Date.now() });
          break;
        case AXON_COMMANDS.AI_REFACTOR_SELECTION:
          if (!requireTrustedWorkspace("Ask Axon")) break;
          setAgentSidebarOpen(true);
          setAgentActionRequest({
            action: "refactor-selection",
            nonce: Date.now(),
          });
          break;
        case AXON_COMMANDS.AI_GENERATE_TESTS:
          if (!requireTrustedWorkspace("Ask Axon")) break;
          setAgentSidebarOpen(true);
          setAgentActionRequest({
            action: "generate-tests",
            nonce: Date.now(),
          });
          break;
        case AXON_COMMANDS.AI_REVIEW_GIT_DIFF:
          if (!requireTrustedWorkspace("Ask Axon")) break;
          setAgentSidebarOpen(true);
          setAgentActionRequest({
            action: "review-git-diff",
            nonce: Date.now(),
          });
          break;
        case AXON_COMMANDS.AI_DRAFT_COMMIT_MESSAGE:
          if (!requireTrustedWorkspace("Ask Axon")) break;
          setAgentSidebarOpen(true);
          setAgentActionRequest({
            action: "draft-commit-message",
            nonce: Date.now(),
          });
          break;
        case AXON_COMMANDS.TOGGLE_ZEN_MODE:
          setZenMode((prev: boolean) => !prev);
          break;
        case AXON_COMMANDS.NEW_TERMINAL:
          handleNewTerminal();
          break;
      }
    },
    [
      activeFilePath,
      appendOutput,
      clearOutputEntries,
      handleCloseActiveTab,
      handleNewFile,
      handleNewTerminal,
      handleOpenFolder,
      handleOpenHtmlPreview,
      handleOpenSettingsJson,
      handleSaveActiveFile,
      navigateDiagnostic,
      refreshGitStatus,
      refreshProjectDiagnostics,
      requireTrustedWorkspace,
      runEditorAction,
      settings,
      terminalOpen,
      updateAvailable,
      setAboutOpen,
      setAgentActionRequest,
      setAgentSidebarOpen,
      setBottomPanelOpen,
      setBottomPanelTab,
      setDiffFilePath,
      setDiffOpen,
      setExtensionsOpen,
      setFileOutlineOpen,
      setLanguageToolsOpen,
      setPaletteOpen,
      setSettingsOpen,
      setSidebarCollapsed,
      setSidebarView,
      setSourceControlOpen,
      setTaskRunnerOpen,
      setTerminalOpen,
      setTestExplorerOpen,
      setUpdateModalOpen,
      setWorkspaceOverviewOpen,
      setWorkspaceSearchOpen,
      setZenMode,
    ],
  );
}
