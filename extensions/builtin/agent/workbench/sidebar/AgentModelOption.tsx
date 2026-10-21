/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArrowDownToLine, Check } from "lucide-react";

// Shared row for every model picker surface. The composer picker and the status
// panel picker list the same models, and they drift apart as soon as each one
// owns its own markup, which is how one of them ends up with a status marker
// the other does not have.
interface Props {
  active: boolean;
  label: string;
  needsDownload?: boolean;
  note: string;
  onSelect: () => void;
}

export default function AgentModelOption({
  active,
  label,
  needsDownload = false,
  note,
  onSelect,
}: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
        active
          ? "bg-[var(--axon-panel-overlay-hover)]"
          : "hover:bg-[var(--axon-panel-overlay-hover)]"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[12px] text-[var(--axon-editor-foreground)] ${
            active ? "font-medium" : ""
          }`}
        >
          {label}
        </span>
        {note && (
          <span className="mt-0.5 block truncate text-[10px] leading-4 text-[var(--axon-editor-foreground)] opacity-40">
            {note}
          </span>
        )}
      </span>
      {active && (
        <Check
          size={12}
          className="shrink-0 text-[var(--axon-syntax-function)]"
        />
      )}
      {!active && needsDownload && (
        <ArrowDownToLine
          size={12}
          className="shrink-0 text-[var(--axon-editor-foreground)] opacity-25"
        />
      )}
    </button>
  );
}
