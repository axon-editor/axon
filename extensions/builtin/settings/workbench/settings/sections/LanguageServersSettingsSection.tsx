/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FolderOpen, ScrollText, Zap } from "lucide-react";
import { type AxonSettings } from "@axon-editor/shared/settings";
import SettingsButton from "../controls/SettingsButton";
import SettingsField from "../controls/SettingsField";
import SettingsSection from "../controls/SettingsSection";
import SettingsTextInput from "../controls/SettingsTextInput";
import SettingsToggle from "../controls/SettingsToggle";

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
    <SettingsSection>
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

      {pythonDetected && (
        <SettingsField
          label="Python environment"
          description="Axon detects environments inside or beside the workspace. Select one only to override the detected environment."
        >
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <SettingsButton
                label="Select environment"
                icon={<FolderOpen size={14} />}
                tone="primary"
                disabled={!folderPath}
                onClick={onSelectPythonVirtualEnv}
              />
              <SettingsButton
                label="Clear"
                tone="ghost"
                disabled={
                  !draft.lsp.pythonVirtualEnvPath &&
                  !draft.lsp.pythonInterpreterPath
                }
                onClick={onClearPythonVirtualEnv}
              />
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
            {pythonEnvironmentMessage && (
              <div className="text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-55">
                {pythonEnvironmentMessage}
              </div>
            )}
          </div>
        </SettingsField>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SettingsButton
          label="Language Tools"
          icon={<Zap size={14} />}
          tone="primary"
          onClick={onOpenLanguageTools}
        />
        <SettingsButton
          label="LSP Logs"
          icon={<ScrollText size={14} />}
          tone="ghost"
          onClick={onViewLogs}
        />
      </div>
    </SettingsSection>
  );
}