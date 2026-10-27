/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface Props {
  label: string;
  meta?: string;
}

export default function ZenTreeSectionHeader({ label, meta }: Props) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--axon-panel-border)] bg-[var(--axon-solid-popup-background,var(--axon-panel-background))] px-4 py-1.5">
      <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--axon-editor-foreground)] opacity-40">
        {label}
      </span>
      {meta && (
        <span className="rounded-full bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[9px] tabular-nums text-[var(--axon-editor-foreground)] opacity-45">
          {meta}
        </span>
      )}
    </div>
  );
}
