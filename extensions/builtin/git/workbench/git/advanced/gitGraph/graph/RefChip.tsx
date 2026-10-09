/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export default function RefChip({ value }: { value: string }) {
  const isTag = value.startsWith("tag:");
  return (
    <span
      className={`max-w-40 truncate rounded border px-1.5 py-0.5 text-[10px] ${isTag ? "border-[var(--axon-info-foreground)] bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-info-foreground)]" : "border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)] opacity-75"}`}
    >
      {value.replace(/^HEAD -> /, "")}
    </span>
  );
}
