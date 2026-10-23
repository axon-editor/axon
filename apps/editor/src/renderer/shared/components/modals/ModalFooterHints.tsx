/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface Props {
  hints: string[];
}

export default function ModalFooterHints({ hints }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--axon-panel-border)] px-4 py-2 text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
      {hints.map((hint) => (
        <span key={hint}>{hint}</span>
      ))}
    </div>
  );
}
