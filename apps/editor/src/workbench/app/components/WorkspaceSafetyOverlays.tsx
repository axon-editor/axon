import { setWorkspaceTrusted } from "../../../renderer/features/sidebar";
import WorkspaceLoadingOverlay from "../../../renderer/shared/components/WorkspaceLoadingOverlay";
import CliToolInstallPrompt from "../../../renderer/features/cli/CliToolInstallPrompt";
import LanguageToolInstallPrompt from "../../../renderer/features/languageTools/LanguageToolInstallPrompt";
import { getPathBasename } from "../lib/appPath";

export default function WorkspaceSafetyOverlays(props: Record<string, any>) {
  const {
    appendOutput,
    cliToolInstallPrompt,
    languageToolInstallPrompt,
    loading,
    setWorkspaceTrustNonce,
    setWorkspaceTrustPromptPath,
    workspaceTrustPromptPath,
  } = props;

  return (
    <>
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
      <LanguageToolInstallPrompt prompt={languageToolInstallPrompt} />
    </>
  );
}
