/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Settings footer: the save status on the left, and the local Close action on
// the right. Reset appears here only on narrow layouts where the header action
// row collapses, so the flow stays reachable without ever needing to scroll.
import { RotateCcw } from "lucide-react";
import SettingsButton from "../controls/SettingsButton";
import SettingsSaveStatus from "./SettingsSaveStatus";
import { type SettingsSaveState } from "./types";

export default function SettingsFooter({
  dirty,
  saveState,
  onReset,
  onClose,
}: {
  dirty: boolean;
  saveState: SettingsSaveState;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-t border-[var(--axon-panel-border)] bg-[var(--axon-toolbar-background)] px-5 py-3">
      <div className="min-w-0 text-[11px] text-[var(--axon-editor-foreground)]">
        <SettingsSaveStatus dirty={dirty} saveState={saveState} />
      </div>
      <div className="flex items-center gap-2">
        <div className="md:hidden">
          <SettingsButton
            label="Reset"
            icon={<RotateCcw size={13} />}
            tone="ghost"
            disabled={!dirty}
            onClick={onReset}
          />
        </div>
        <SettingsButton label="Close" tone="ghost" onClick={onClose} />
      </div>
    </div>
  );
}