import { setWorkspaceTrusted } from "../../../renderer/features/sidebar";
import WorkspaceLoadingOverlay from "../../../renderer/shared/components/WorkspaceLoadingOverlay";
import CliToolInstallPrompt from "../../../renderer/features/cli/CliToolInstallPrompt";
import LanguageToolInstallPrompt from "../../../renderer/features/languageTools/LanguageToolInstallPrompt";
import LanguageToolInstallStatus from "../../../renderer/features/languageTools/LanguageToolInstallStatus";
import type { AxonWorkbenchLayoutProps } from "../AxonAppView";
import WorkspaceTrustPrompt from "./workspaceTrust/WorkspaceTrustPrompt";

export default function WorkspaceSafetyOverlays(
  props: AxonWorkbenchLayoutProps,
) {
  const {
    appendOutput,
    cliToolInstallPrompt,
    languageToolInstallPrompt,
    languageToolInstallations,
    languageToolsOpen,
    loading,
    gitStatus,
    setWorkspaceTrustNonce,
    setWorkspaceTrustPromptPath,
    workspaceTrustPromptPath,
  } = props;
  const parentRepositoryRoot =
    workspaceTrustPromptPath &&
    gitStatus?.root &&
    gitStatus.root !== workspaceTrustPromptPath
      ? gitStatus.root
      : null;

  return (
    <>
      {workspaceTrustPromptPath && (
        <WorkspaceTrustPrompt
          workspacePath={workspaceTrustPromptPath}
          parentRepositoryRoot={parentRepositoryRoot}
          onReject={() => {
            setWorkspaceTrusted(workspaceTrustPromptPath, false);
            setWorkspaceTrustNonce((nonce: number) => nonce + 1);
            setWorkspaceTrustPromptPath(null);
            appendOutput("workspace", "Workspace marked untrusted.");
          }}
          onTrust={() => {
            setWorkspaceTrusted(workspaceTrustPromptPath, true);
            setWorkspaceTrustNonce((nonce: number) => nonce + 1);
            setWorkspaceTrustPromptPath(null);
            appendOutput("workspace", "Workspace trusted.", "success");
          }}
        />
      )}

      {loading && <WorkspaceLoadingOverlay />}
      <CliToolInstallPrompt prompt={cliToolInstallPrompt} />
      <LanguageToolInstallPrompt prompt={languageToolInstallPrompt} />
      {!languageToolsOpen && (
        <LanguageToolInstallStatus
          installations={languageToolInstallations}
          hiddenToolId={
            languageToolInstallPrompt.open
              ? languageToolInstallPrompt.status?.id
              : null
          }
        />
      )}
    </>
  );
}
