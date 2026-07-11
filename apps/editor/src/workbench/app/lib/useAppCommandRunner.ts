import { useCallback } from "react";
import { AXON_COMMANDS, type AxonCommand } from "../../../shared/commands";
import { isHtmlFile } from "@axon-builtin-html-preview/lib/htmlPreviewTabs";
import { parseExtensionViewCommandId } from "../../contrib/extensions/lib/extensionViews";
import {
  getBuiltinCommandAlias,
  getBuiltinViewAlias,
} from "../../contrib/extensions/lib/builtinWorkbenchContributions";

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
  handleSaveActiveFileAs: any;
  navigateDiagnostic: any;
  openProblemsTab: any;
  refreshGitStatus: any;
  refreshProjectDiagnostics: any;
  requireTrustedWorkspace: any;
  runEditorAction: any;
  folderPath: string | null;
  settings: any;
  setExtensionState: any;
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
  setExtensionViewOpenId: any;
  setFileOutlineOpen: any;
  setFolderPickerOpen: any;
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
  handleSaveActiveFileAs,
  navigateDiagnostic,
  openProblemsTab,
  refreshGitStatus,
  refreshProjectDiagnostics,
  requireTrustedWorkspace,
  runEditorAction,
  folderPath,
  settings,
  setExtensionState,
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
  setExtensionViewOpenId,
  setFileOutlineOpen,
  setFolderPickerOpen,
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
  const activateExtensionEvent = useCallback(
    (activationEvent: string, reportSuccess = false) => {
      const startedAt = performance.now();
      void window.axon
        .activateExtensionEvent(activationEvent, folderPath)
        .then((result) => {
          setExtensionState(result.state);
          if (reportSuccess || !result.ok) {
            appendOutput(
              "extensions",
              result.message,
              result.ok ? "info" : "warning",
            );
          }
          if (performance.now() - startedAt > 120) {
            appendOutput(
              "extensions",
              `${activationEvent} activation finished in ${Math.round(
                performance.now() - startedAt,
              )}ms.`,
              result.ok ? "info" : "warning",
            );
          }
        })
        .catch((err) => {
          appendOutput(
            "extensions",
            `Failed to activate '${activationEvent}': ${
              err instanceof Error ? err.message : "unknown extension host error"
            }`,
            "error",
          );
        });
    },
    [appendOutput, folderPath, setExtensionState],
  );

  return useCallback(
    (command: AxonCommand) => {
      let runnableCommand = command;
      const extensionViewId = parseExtensionViewCommandId(command);

      if (extensionViewId) {
        if (!requireTrustedWorkspace("Extension views")) return;

        activateExtensionEvent(`onView:${extensionViewId}`, true);
        const aliasedViewCommand = getBuiltinViewAlias(extensionViewId);
        if (aliasedViewCommand) {
          runnableCommand = aliasedViewCommand;
        } else {
          setExtensionViewOpenId(extensionViewId);
          return;
        }
      }

      if (runnableCommand.startsWith("extension:")) {
        if (!requireTrustedWorkspace("Extension commands")) return;

        const commandId = runnableCommand.slice("extension:".length);
        void window.axon
          .activateExtensionEvent(`onCommand:${commandId}`, folderPath)
          .then((activationResult) => {
            setExtensionState(activationResult.state);
            appendOutput(
              "extensions",
              activationResult.message,
              activationResult.ok ? "info" : "warning",
            );
            return window.axon.executeExtensionCommand(commandId, [], folderPath);
          })
          .then((result) => {
            setExtensionState(result.state);
            if (result.ok) return;
            if (getBuiltinCommandAlias(commandId)) return;
            appendOutput("extensions", result.message, "warning");
          })
          .catch((err) => {
            appendOutput(
              "extensions",
              `Failed to execute '${commandId}': ${
                err instanceof Error ? err.message : "unknown extension host error"
              }`,
              "error",
            );
          });
        const aliasedCommand = getBuiltinCommandAlias(commandId);
        if (!aliasedCommand) return;

        // Built-in workbench contributions are exposed through the same command
        // registry as user extensions, so the command palette should not stop
        // at "activation happened". This alias bridge lets a contributed
        // manifest command open the existing React surface today while keeping
        // the command identity stable for the future executable extension host.
        runnableCommand = aliasedCommand;
      }

      switch (runnableCommand) {
        case AXON_COMMANDS.ABOUT:
          setAboutOpen(true);
          break;
        case AXON_COMMANDS.NEW_FILE:
          void handleNewFile();
          break;
        case AXON_COMMANDS.OPEN_FOLDER:
          setFolderPickerOpen(true);
          break;
        case AXON_COMMANDS.OPEN_RECENT:
          setFolderPickerOpen(true);
          break;
        case AXON_COMMANDS.SAVE:
          handleSaveActiveFile();
          break;
        case AXON_COMMANDS.SAVE_AS:
          void handleSaveActiveFileAs();
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
          activateExtensionEvent("onCommand:axon.search.openWorkspace");
          activateExtensionEvent("onView:axon.search.workspace");
          setWorkspaceSearchOpen((prev: boolean) => !prev);
          break;
        case AXON_COMMANDS.OPEN_TASK_RUNNER:
          if (!requireTrustedWorkspace("Tasks")) break;
          setTaskRunnerOpen(true);
          break;
        case AXON_COMMANDS.OPEN_TEST_EXPLORER:
          if (!requireTrustedWorkspace("Tests")) break;
          activateExtensionEvent("onCommand:axon.testing.open");
          activateExtensionEvent("onView:axon.tests");
          setTestExplorerOpen(true);
          break;
        case AXON_COMMANDS.OPEN_FILE_OUTLINE:
          setFileOutlineOpen(true);
          break;
        case AXON_COMMANDS.OPEN_LANGUAGE_TOOLS:
          setLanguageToolsOpen(true);
          break;
        case AXON_COMMANDS.INSPECT_EDITOR_TOKEN:
          runEditorAction("inspect-token");
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
          activateExtensionEvent("onCommand:axon.problems.open");
          activateExtensionEvent("onView:axon.problems");
          openProblemsTab();
          appendOutput("panel", "Opened Problems tab.");
          break;
        case AXON_COMMANDS.OPEN_OUTPUT_PANEL:
          setBottomPanelTab("output");
          setBottomPanelOpen(true);
          setTerminalOpen(false);
          appendOutput("panel", "Opened Output panel.");
          break;
        case AXON_COMMANDS.REFRESH_DIAGNOSTICS:
          if (!requireTrustedWorkspace("Language server diagnostics")) break;
          activateExtensionEvent("onCommand:axon.problems.refresh");
          openProblemsTab();
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
          activateExtensionEvent("onCommand:axon.git.openSourceControl");
          activateExtensionEvent("onView:axon.sourceControl");
          setSourceControlOpen(true);
          void refreshGitStatus();
          break;
        case AXON_COMMANDS.OPEN_GIT_HISTORY:
          activateExtensionEvent("onCommand:axon.git.openHistory");
          activateExtensionEvent("onView:axon.history");
          setSidebarCollapsed(false);
          setSidebarView("history");
          void refreshGitStatus({ silent: true });
          break;
        case AXON_COMMANDS.OPEN_SPOTIFY:
          activateExtensionEvent("onView:axon.spotify");
          setSidebarCollapsed(false);
          setSidebarView("spotify");
          break;
        case AXON_COMMANDS.TOGGLE_TERMINAL:
          if (!requireTrustedWorkspace("Terminal")) break;
          activateExtensionEvent("onCommand:axon.terminal.toggle");
          activateExtensionEvent("onTerminalProfile:axon.terminal.default");
          setBottomPanelOpen(false);
          setTerminalOpen((prev: boolean) => !prev);
          appendOutput(
            "terminal",
            terminalOpen ? "Hid terminal." : "Showed terminal.",
          );
          break;
        case AXON_COMMANDS.OPEN_SETTINGS:
          activateExtensionEvent("onCommand:axon.settings.open");
          activateExtensionEvent("onView:axon.settings");
          setSettingsOpen(true);
          break;
        case AXON_COMMANDS.OPEN_EXTENSIONS:
          if (!requireTrustedWorkspace("Extensions")) break;
          setExtensionsOpen(true);
          break;
        case AXON_COMMANDS.OPEN_SETTINGS_JSON:
          activateExtensionEvent("onCommand:axon.settings.openJson");
          void handleOpenSettingsJson();
          break;
        case AXON_COMMANDS.OPEN_UPDATE_NOTES:
          if (updateAvailable) {
            setUpdateModalOpen(true);
          }
          break;
        case AXON_COMMANDS.ASK_AXON:
          if (!requireTrustedWorkspace("Ask Axon")) break;
          activateExtensionEvent("onCommand:axon.agent.open");
          activateExtensionEvent("onView:axon.agent");
          activateExtensionEvent("onAgent:axon.agent.local");
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
          activateExtensionEvent("onCommand:axon.agent.fixProblems");
          activateExtensionEvent("onView:axon.agent");
          activateExtensionEvent("onAgent:axon.agent.local");
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
          activateExtensionEvent("onCommand:axon.terminal.new");
          activateExtensionEvent("onTerminalProfile:axon.terminal.default");
          handleNewTerminal();
          break;
      }
    },
    [
      activeFilePath,
      activateExtensionEvent,
      appendOutput,
      clearOutputEntries,
      handleCloseActiveTab,
      handleNewFile,
      handleNewTerminal,
      handleOpenFolder,
      handleOpenHtmlPreview,
      handleOpenSettingsJson,
      handleSaveActiveFile,
      handleSaveActiveFileAs,
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
      setExtensionViewOpenId,
      setFileOutlineOpen,
      setFolderPickerOpen,
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
