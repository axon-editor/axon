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
    <span className="inline-flex items-center gap-1 rounded bg-[var(--axon-syntax-function)]/15 px-2 py-0.5 text-[10px] text-[var(--axon-syntax-function)]">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-full hover:bg-[var(--axon-syntax-function)]/25"
        aria-label={`Remove ${label}`}
      >
        <X size={9} />
      </button>
    </span>
  );
}
