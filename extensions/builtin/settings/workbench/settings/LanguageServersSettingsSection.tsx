import { FolderOpen, ScrollText, Zap } from "lucide-react";
import { type AxonSettings } from "@axon-editor/shared/settings";
import {
  SettingsField,
  SettingsSection,
  SettingsTextInput,
  SettingsToggle,
} from "./SettingsControls";

interface LanguageServersSettingsSectionProps {
  draft: AxonSettings;
  folderPath: string | null;
  onClearPythonVirtualEnv: () => void;
  onOpenLanguageTools: () => void;
  onSelectPythonVirtualEnv: () => void;
  onUpdateLsp: <K extends keyof AxonSettings["lsp"]>(
    key: K,
    value: AxonSettings["lsp"][K],
  ) => void;
  onViewLogs: () => void;
  pythonDetected: boolean;
  pythonEnvironmentMessage: string | null;
}

export default function LanguageServersSettingsSection({
  draft,
  folderPath,
  onClearPythonVirtualEnv,
  onOpenLanguageTools,
  onSelectPythonVirtualEnv,
  onUpdateLsp,
  onViewLogs,
  pythonDetected,
  pythonEnvironmentMessage,
}: LanguageServersSettingsSectionProps) {
  return (
    <SettingsSection
      title="Language Intelligence"
      description="Configure editor-wide language behavior. Workspace tools and server lifecycle are managed from the status bar."
    >
      <SettingsField
        label="Language services"
        description="Controls external completion, diagnostics, hover, navigation, rename, and formatting providers."
      >
        <SettingsToggle
          checked={draft.lsp.enabled}
          onChange={(checked) => onUpdateLsp("enabled", checked)}
          label={draft.lsp.enabled ? "Enabled" : "Disabled"}
        />
      </SettingsField>

      {pythonDetected ? (
        <SettingsField
          label="Python environment"
          description="Select a workspace environment when Python imports are unavailable from the detected interpreter."
        >
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onSelectPythonVirtualEnv}
                disabled={!folderPath}
                className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-3 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:border-[var(--axon-syntax-function)] hover:bg-[var(--axon-panel-overlay-hover)] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <FolderOpen size={14} />
                Select environment
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
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[10px] text-[var(--axon-editor-foreground)] opacity-55">
                Project environment folder
              </span>
              <SettingsTextInput
                value={draft.lsp.pythonVirtualEnvPath}
                onChange={(value) =>
                  onUpdateLsp("pythonVirtualEnvPath", value)
                }
                placeholder="No project environment detected"
                monospace
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[10px] text-[var(--axon-editor-foreground)] opacity-55">
                Interpreter executable
              </span>
              <SettingsTextInput
                value={draft.lsp.pythonInterpreterPath}
                onChange={(value) =>
                  onUpdateLsp("pythonInterpreterPath", value)
                }
                placeholder="Resolved automatically"
                monospace
              />
            </label>
            {pythonEnvironmentMessage ? (
              <div className="text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-55">
                {pythonEnvironmentMessage}
              </div>
            ) : null}
          </div>
        </SettingsField>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onOpenLanguageTools}
          className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-3 text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:border-[var(--axon-syntax-function)] hover:bg-[var(--axon-panel-overlay-hover)]"
        >
          <Zap size={14} />
          Language Tools
        </button>
        <button
          type="button"
          onClick={onViewLogs}
          className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md px-3 text-[12px] text-[var(--axon-editor-foreground)] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
        >
          <ScrollText size={14} />
          LSP Logs
        </button>
      </div>
    </SettingsSection>
  );
}
