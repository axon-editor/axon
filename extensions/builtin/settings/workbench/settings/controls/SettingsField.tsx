/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// One labeled settings row: the label and explanatory description on the left,
// the actual control on the right. On narrow modals the grid collapses to a
// single column so the description sits above the control instead of crushing
// it sideways.
import { type ReactNode } from "react";

export default function SettingsField({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 border-b border-[var(--axon-panel-border)] py-5 md:grid-cols-[minmax(220px,280px)_1fr] md:items-center">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-[var(--axon-editor-foreground)]">{label}</div>
        {description && (
          <div className="mt-1 text-[12px] leading-5 text-[var(--axon-editor-foreground)] opacity-55">
            {description}
          </div>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}