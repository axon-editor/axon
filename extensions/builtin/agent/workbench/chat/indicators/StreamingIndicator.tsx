/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import BrailleSpinner from "./BrailleSpinner";

interface Props {
  label?: string;
  active?: boolean;
}

export default function StreamingIndicator({
  label = "Thinking",
  active = true,
}: Props) {
  return (
    <div className="flex items-center gap-2 py-1.5 text-[11px] text-[var(--axon-editor-foreground)] opacity-45">
      {active ? (
        <BrailleSpinner />
      ) : (
        <span className="h-1 w-1 rounded-full bg-[var(--axon-syntax-function)]/40" />
      )}
      <span>{label}</span>
    </div>
  );
}
