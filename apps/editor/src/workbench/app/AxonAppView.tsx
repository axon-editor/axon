import * as React from "react";
import { resolveTerminalWorkbenchContribution } from "@axon-builtin-terminal/lib/contribution";
import { resolveAgentWorkbenchContribution } from "@axon-builtin-agent/lib/contribution";
import { resolveSearchWorkbenchContribution } from "@axon-builtin-search/lib/contribution";
import { resolveGitWorkbenchContribution } from "@axon-builtin-git/lib/contribution";
import { resolveSettingsWorkbenchContribution } from "@axon-builtin-settings/lib/contribution";
import { resolveTestingWorkbenchContribution } from "@axon-builtin-testing/lib/contribution";
import { resolveTasksWorkbenchContribution } from "@axon-builtin-tasks/lib/contribution";
import { resolveLanguageToolsWorkbenchContribution } from "@axon-builtin-language-tools/lib/contribution";
import { resolveSpotifyWorkbenchContribution } from "@axon-builtin-spotify/lib/contribution";
import { getEnabledExtensionThemes } from "../../shared/extensions";
import AxonWorkbenchLayout from "./components/AxonWorkbenchLayout";

export function AxonAppView(props: Record<string, any>) {
  const { extensionState } = props;
  const welcomeThemeItems = React.useMemo(
    () =>
      getEnabledExtensionThemes({
        extensions: (extensionState?.extensions ?? []).filter(
          (extension: any) => extension.source === "internal",
        ),
      })
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
  const testingContribution = React.useMemo(
    () => resolveTestingWorkbenchContribution(extensionState),
    [extensionState],
  );
  const tasksContribution = React.useMemo(
    () => resolveTasksWorkbenchContribution(extensionState),
    [extensionState],
  );
  const languageToolsContribution = React.useMemo(
    () => resolveLanguageToolsWorkbenchContribution(extensionState),
    [extensionState],
  );
  const spotifyContribution = React.useMemo(
    () => resolveSpotifyWorkbenchContribution(extensionState),
    [extensionState],
  );

  return (
    <AxonWorkbenchLayout
      {...props}
      agentSidebarWidth={agentSidebarWidth}
      agentContribution={agentContribution}
      gitContribution={gitContribution}
      languageToolsContribution={languageToolsContribution}
      searchContribution={searchContribution}
      setAgentSidebarWidth={setAgentSidebarWidth}
      settingsContribution={settingsContribution}
      spotifyContribution={spotifyContribution}
      tasksContribution={tasksContribution}
      terminalContribution={terminalContribution}
      testingContribution={testingContribution}
      welcomeThemeItems={welcomeThemeItems}
    />
  );
}
