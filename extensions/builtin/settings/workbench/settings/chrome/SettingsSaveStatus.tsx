/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Compact save-state readout shared by the sidebar footer and the modal footer.
// Saving and error states collapse to a single treatment so the user always
// knows whether the dash-typed change actually landed, without a full toast.
import { AlertCircle, Check, LoaderCircle } from "lucide-react";
import { type SettingsSaveState } from "./types";

export default function SettingsSaveStatus({
  dirty,
  saveState,
}: {
  dirty: boolean;
  saveState: SettingsSaveState;
}) {
  if (saveState === "saving") {
    return (
      <span className="flex items-center gap-1.5 opacity-65">
        <LoaderCircle size={12} className="animate-spin" />
        Saving settings...
      </span>
    );
  }

  if (saveState === "error") {
    return (
      <span className="flex items-center gap-1.5 text-[var(--axon-danger-foreground)]">
        <AlertCircle size={12} />
        Settings could not be saved
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 opacity-55">
      <Check size={12} />
      {dirty ? "Changes saved automatically" : "Settings save automatically"}
    </span>
  );
}