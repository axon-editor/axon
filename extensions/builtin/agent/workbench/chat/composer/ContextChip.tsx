/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { X } from "lucide-react";

interface ContextChipProps {
  label: string;
  onRemove: () => void;
}

export default function ContextChip({ label, onRemove }: ContextChipProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--axon-panel-overlay-hover)] px-2 py-0.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-60">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-full opacity-50 transition-opacity hover:bg-[var(--axon-syntax-function)]/20 hover:opacity-100"
        aria-label={`Remove ${label}`}
      >
        <X size={8} />
      </button>
    </span>
  );
}
