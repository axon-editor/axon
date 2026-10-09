/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] ${
        status === "active"
          ? "bg-[#152019] text-[#8fe3a2]"
          : status === "failed"
            ? "bg-[#341b20] text-[#ff8b92]"
            : status === "activating"
              ? "bg-[#2c2414] text-[#ffd580]"
              : "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)] opacity-55"
      }`}
    >
      {status}
    </span>
  );
}