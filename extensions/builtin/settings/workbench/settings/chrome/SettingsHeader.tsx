/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Page header for the active settings section. It owns the single authoritative
// heading for the current page (section components no longer duplicate it), the
// workspace-vs-user scope pill, the Reset action, and the Close button that
// lives beside the window chrome instead of only in the footer.
import { Braces, RotateCcw, X } from "lucide-react";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";
import { type SettingsSectionDefinition } from "../lib/settingsData";
import SettingsButton from "../controls/SettingsButton";

interface SettingsHeaderProps {
  activeSectionMeta: SettingsSectionDefinition;
  scopeMode: "workspace" | "user";
  scopePathLabel: string;
  scopeHint: string;
  dirty: boolean;
  onReset: () => void;
  onClose: () => void;
}

export default function SettingsHeader({
  activeSectionMeta,
  scopeMode,
  scopePathLabel,
  scopeHint,
  dirty,
  onReset,
  onClose,
}: SettingsHeaderProps) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--axon-panel-border)] px-7 py-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-55">
          <span className="rounded bg-[var(--axon-accent-muted)] px-2 py-0.5 text-[var(--axon-accent)]">
            {scopeMode === "workspace" ? "Workspace" : "User"}
          </span>
          <span className="truncate">{scopePathLabel}</span>
        </div>
        <h2 className="mt-3 text-[22px] font-semibold text-[var(--axon-editor-foreground)]">
          {activeSectionMeta.label}
        </h2>
        <p className="mt-1 max-w-2xl text-[13px] leading-6 text-[var(--axon-editor-foreground)] opacity-65">
          {activeSectionMeta.description}
        </p>
        <div className="mt-2 flex items-center gap-1.5 text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
          <Braces size={13} className="shrink-0" />
          <span>{scopeHint}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <SettingsButton
          label="Reset"
          icon={<RotateCcw size={13} />}
          tone="primary"
          disabled={!dirty}
          onClick={onReset}
        />
        <Tooltip label="Close" side="left">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="cursor-pointer rounded-md p-1.5 text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
          >
            <X size={15} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}