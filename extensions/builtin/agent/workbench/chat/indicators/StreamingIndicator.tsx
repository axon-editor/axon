/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export default function StreamingIndicator() {
  return (
    <div className="flex items-center gap-2 py-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
      <span className="flex gap-0.5">
        <span className="h-1.5 w-1.5 animate-[bounce_1.4s_infinite_0s] rounded-full bg-[var(--axon-syntax-function)]/60" />
        <span className="h-1.5 w-1.5 animate-[bounce_1.4s_infinite_0.2s] rounded-full bg-[var(--axon-syntax-function)]/60" />
        <span className="h-1.5 w-1.5 animate-[bounce_1.4s_infinite_0.4s] rounded-full bg-[var(--axon-syntax-function)]/60" />
      </span>
      <span>Thinking</span>
    </div>
  );
}
