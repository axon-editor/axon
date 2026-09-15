/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export default function StreamingIndicator() {
  return (
    <div className="flex items-center gap-2.5 py-1 text-[12px] text-[var(--axon-editor-foreground)] opacity-55">
      <span className="relative flex h-5 w-5 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--axon-syntax-function)] opacity-20" />
        <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-[var(--axon-syntax-function)] text-[9px] font-bold text-white">
          A
        </span>
      </span>
      <span>Thinking...</span>
    </div>
  );
}
