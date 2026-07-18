import StatusBar from "../../../renderer/shared/components/StatusBar";
import { AXON_COMMANDS } from "../../../shared/commands";
import { isVirtualTabPath } from "../../../renderer/features/editor/lib/tabIdentity";

export default function WorkbenchStatusBar(props: Record<string, any>) {
  const {
    activePane,
    agentSidebarOpen,
    bottomPanelOpen,
    bottomPanelTab,
    cursorInfo,
    diagnosticCounts,
    folderPath,
    gitChangeCount,
    gitStatus,
    language,
    languageToolsOpen,
    runCommand,
    setAgentSidebarOpen,
    setLanguageToolsOpen,
    setSidebarCollapsed,
    setSidebarView,
    settings,
    sidebarCollapsed,
    sidebarView,
    terminalOpen,
    themeTokens,
    zenMode,
  } = props;

  return (
    <>
      {!zenMode && (
        <StatusBar
          activeFile={activePane?.activeFile ?? null}
          codeSnapshotAvailable={Boolean(
            activePane?.activeFile && !isVirtualTabPath(activePane.activeFile),
          )}
          hasWorkspace={!!folderPath}
          language={language}
          languageToolsOpen={languageToolsOpen}
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
          onToggleAgentSidebar={() =>
            setAgentSidebarOpen((open: boolean) => !open)
          }
          onOpenProblems={() => runCommand(AXON_COMMANDS.OPEN_PROBLEMS_PANEL)}
          onOpenBottomPanel={(tab) =>
            runCommand(
              tab === "output"
                ? AXON_COMMANDS.OPEN_OUTPUT_PANEL
                : AXON_COMMANDS.OPEN_PROBLEMS_PANEL,
            )
          }
          onOpenCodeSnapshot={() =>
            runCommand(AXON_COMMANDS.OPEN_CODE_SNAPSHOT)
          }
          onOpenLanguageTools={() =>
            setLanguageToolsOpen((open: boolean) => !open)
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
    </>
  );
}
