import { Download, FolderOpen } from "lucide-react";
import { type AxonSettings } from "@axon-editor/shared/settings";
import { type LanguageServerStatus } from "@axon-editor/shared/lsp";
import {
  type ManagedLanguageToolId,
  type ManagedLanguageToolStatus,
} from "@axon-editor/shared/languageTools";
import {
  enableManagedLanguageToolPrompt,
  isManagedLanguageToolPromptDisabled,
} from "@axon-editor/renderer/features/languageTools/languageToolPreferences";
import {
  SettingsField,
  SettingsSection,
  SettingsTextInput,
  SettingsToggle,
} from "./SettingsControls";

interface LanguageServersSettingsSectionProps {
  draft: AxonSettings;
  folderPath: string | null;
  hasPythonWorkspace: boolean;
  languageServerAction: "start" | "stop" | "restart" | null;
  languageServerMessage: string | null;
  languageServers: LanguageServerStatus[];
  loadingLanguageServers: boolean;
  managedLanguageTools: ManagedLanguageToolStatus[];
  installingManagedLanguageTool: ManagedLanguageToolId | null;
  workspaceTrusted: boolean;
  onClearPythonVirtualEnv: () => void;
  onRefreshLanguageServers: () => void;
  onRunLanguageServerAction: (action: "start" | "stop" | "restart") => void;
  onInstallManagedLanguageTool: (id: ManagedLanguageToolId) => void;
  onCancelManagedLanguageToolInstall: (id: ManagedLanguageToolId) => void;
  onUninstallManagedLanguageTool: (id: ManagedLanguageToolId) => void;
  onSelectPythonVirtualEnv: () => void;
  onUpdateLsp: <K extends keyof AxonSettings["lsp"]>(
    key: K,
    value: AxonSettings["lsp"][K],
  ) => void;
  onViewLogs: () => void;
}

function getLanguageServerStatusLabel(server: LanguageServerStatus) {
  if (server.status === "failed") return "failed";
  if (server.status === "running") return "running";
  if (server.bundled && server.status === "available") return "bundled";
  if (server.status === "available") return "available";
  return "missing";
}

function getLanguageServerStatusClass(server: LanguageServerStatus) {
  if (server.status === "failed") return "bg-[#341b20] text-[#ff8b92]";
  if (server.status === "running") return "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-syntax-function)]";
  if (server.bundled) return "bg-[#15321f] text-[#90c8a0]";
  if (server.status === "available") return "bg-[#1c2636] text-[#9fb7e8]";
  return "bg-[#2a1517] text-[#ff7b72]";
}

export default function LanguageServersSettingsSection({
  draft,
  folderPath,
  hasPythonWorkspace,
  languageServerAction,
  languageServerMessage,
  languageServers,
  loadingLanguageServers,
  managedLanguageTools,
  installingManagedLanguageTool,
  workspaceTrusted,
  onClearPythonVirtualEnv,
  onRefreshLanguageServers,
  onRunLanguageServerAction,
  onInstallManagedLanguageTool,
  onCancelManagedLanguageToolInstall,
  onUninstallManagedLanguageTool,
  onSelectPythonVirtualEnv,
  onUpdateLsp,
  onViewLogs,
}: LanguageServersSettingsSectionProps) {
  return (
    <SettingsSection
      title="Language Servers"
      description="Axon starts real language servers for project-aware completion, diagnostics, hover, references, rename, and formatting."
    >
      <SettingsField
        label="LSP services"
        description="Disabling this turns off external language intelligence while keeping Monaco's basic editor features."
      >
        <SettingsToggle
          checked={draft.lsp.enabled}
          onChange={(checked) => onUpdateLsp("enabled", checked)}
          label={draft.lsp.enabled ? "Enabled" : "Disabled"}
        />
      </SettingsField>

      {hasPythonWorkspace ? (
        <SettingsField
          label="Python virtual environment"
          description="Optional. Python works without this, but select a project venv/interpreter when external packages like Django REST Framework need to resolve."
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onSelectPythonVirtualEnv}
                disabled={!folderPath}
                className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-3 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:border-[var(--axon-syntax-function)] hover:bg-[var(--axon-panel-overlay-hover)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <FolderOpen size={14} />
                Select venv
              </button>
              <button
                type="button"
                onClick={onClearPythonVirtualEnv}
                disabled={
                  !draft.lsp.pythonVirtualEnvPath &&
                  !draft.lsp.pythonInterpreterPath
                }
                className="h-8 cursor-pointer rounded-md px-3 text-[12px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-35"
              >
                Clear
              </button>
            </div>
            <SettingsTextInput
              value={draft.lsp.pythonVirtualEnvPath}
              onChange={(value) => onUpdateLsp("pythonVirtualEnvPath", value)}
              placeholder=".venv path"
              monospace
            />
            <SettingsTextInput
              value={draft.lsp.pythonInterpreterPath}
              onChange={(value) => onUpdateLsp("pythonInterpreterPath", value)}
              placeholder="Python interpreter path"
              monospace
            />
          </div>
        </SettingsField>
      ) : null}

      <div className="rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)]">
        <div className="border-b border-[var(--axon-panel-border)] px-3 py-2 text-[12px] font-medium text-[var(--axon-editor-foreground)]">
          Managed language support
        </div>
        <div className="divide-y divide-[var(--axon-panel-border)]">
          {managedLanguageTools.map((tool) => {
            const recommendationsDisabled =
              isManagedLanguageToolPromptDisabled(tool.id);
            return (
              <div
                key={tool.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-[var(--axon-editor-foreground)]">
                      {tool.label}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${tool.installed ? "bg-[#15321f] text-[#90c8a0]" : "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)] opacity-65"}`}>
                      {tool.installed ? "installed" : "available"}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-45">
                    {tool.detail}
                  </div>
                  {tool.requiredBy.length > 0 ? (
                    <div className="mt-1 text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
                      Required by {tool.requiredBy.join(", ")}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  {recommendationsDisabled ? (
                    <button
                      type="button"
                      onClick={() => {
                        enableManagedLanguageToolPrompt(tool.id);
                        onRefreshLanguageServers();
                      }}
                      className="h-7 cursor-pointer rounded px-2 text-[10px] text-[var(--axon-editor-foreground)] opacity-60 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
                    >
                      Enable prompts
                    </button>
                  ) : null}
                  {installingManagedLanguageTool === tool.id ? (
                    <button
                      type="button"
                      onClick={() => onCancelManagedLanguageToolInstall(tool.id)}
                      className="h-7 cursor-pointer rounded px-2 text-[10px] text-[var(--axon-editor-foreground)] opacity-65 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onInstallManagedLanguageTool(tool.id)}
                      disabled={!tool.supported || installingManagedLanguageTool !== null}
                      className="flex h-7 cursor-pointer items-center gap-1.5 rounded border border-[var(--axon-panel-border)] px-2 text-[10px] text-[var(--axon-editor-foreground)] hover:border-[var(--axon-syntax-function)] hover:bg-[var(--axon-panel-overlay-hover)] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <Download size={11} />
                      {tool.updateAvailable
                        ? "Update"
                        : tool.installed
                          ? "Repair"
                          : "Install"}
                    </button>
                  )}
                  {tool.installed ? (
                    <button
                      type="button"
                      onClick={() => onUninstallManagedLanguageTool(tool.id)}
                      disabled={
                        installingManagedLanguageTool !== null ||
                        tool.requiredBy.length > 0
                      }
                      className="h-7 cursor-pointer rounded px-2 text-[10px] text-[#ff8b92] opacity-70 hover:bg-[#341b20] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Uninstall
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)]">
        <div className="flex items-center justify-between border-b border-[var(--axon-panel-border)] px-3 py-2">
          <div className="text-[12px] font-medium text-[var(--axon-editor-foreground)]">
            Workspace servers
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onRunLanguageServerAction("start")}
              disabled={
                !folderPath ||
                !draft.lsp.enabled ||
                !workspaceTrusted ||
                languageServerAction !== null
              }
              className="h-7 cursor-pointer rounded px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {languageServerAction === "start" ? "Starting..." : "Start"}
            </button>
            <button
              type="button"
              onClick={() => onRunLanguageServerAction("stop")}
              disabled={!folderPath || !workspaceTrusted || languageServerAction !== null}
              className="h-7 cursor-pointer rounded px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {languageServerAction === "stop" ? "Stopping..." : "Stop"}
            </button>
            <button
              type="button"
              onClick={() => onRunLanguageServerAction("restart")}
              disabled={
                !folderPath ||
                !draft.lsp.enabled ||
                !workspaceTrusted ||
                languageServerAction !== null
              }
              className="h-7 cursor-pointer rounded px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {languageServerAction === "restart" ? "Restarting..." : "Restart"}
            </button>
            <button
              type="button"
              onClick={onRefreshLanguageServers}
              disabled={!folderPath || loadingLanguageServers}
              className="h-7 cursor-pointer rounded px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {loadingLanguageServers ? "Checking..." : "Refresh"}
            </button>
            <button
              type="button"
              onClick={onViewLogs}
              className="h-7 cursor-pointer rounded px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-editor-foreground)]"
            >
              View logs
            </button>
          </div>
        </div>

        {languageServerMessage ? (
          <div className="border-b border-[var(--axon-panel-border)] px-3 py-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-45">
            {languageServerMessage}
          </div>
        ) : null}

        {!folderPath ? (
          <div className="px-3 py-4 text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
            Open a workspace folder to detect language servers.
          </div>
        ) : languageServers.length === 0 && !loadingLanguageServers ? (
          <div className="px-3 py-4 text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
            No language server status is available yet.
          </div>
        ) : (
          <div className="divide-y divide-[#222838]">
            {languageServers.map((server) => (
              <div
                key={server.id}
                className="grid grid-cols-[1fr_auto] gap-3 px-3 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-[var(--axon-editor-foreground)]">
                      {server.label}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] ${getLanguageServerStatusClass(server)}`}
                    >
                      {getLanguageServerStatusLabel(server)}
                    </span>
                    {server.relevant ? (
                      <span className="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[10px] text-[var(--axon-syntax-function)]">
                        workspace
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-45">
                    {server.detail}
                  </div>
                  {server.lastError ? (
                    <div className="mt-1 text-[11px] leading-4 text-[#ff8b92]">
                      {server.lastError}
                    </div>
                  ) : null}
                  {server.runtimeRequirement ? (
                    <div className="mt-1 text-[11px] leading-4 text-[#8f9bb1]">
                      {server.runtimeRequirement}
                    </div>
                  ) : null}
                  <div className="mt-1 truncate font-mono text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
                    {server.command}
                  </div>
                  {server.runtimeHint ? (
                    <div className="mt-1 truncate font-mono text-[10px] text-[#60708c]">
                      {server.runtimeHint}
                    </div>
                  ) : null}
                </div>
                <div className="max-w-[220px] text-right text-[10px] leading-4 text-[var(--axon-editor-foreground)] opacity-45">
                  {server.available
                    ? server.languages.join(", ")
                    : server.installHint}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
