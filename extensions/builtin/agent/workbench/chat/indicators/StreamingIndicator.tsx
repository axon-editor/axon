/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
        <span className="flex gap-0.5">
          <span className="h-1.5 w-1.5 animate-[bounce_1.4s_infinite_0s] rounded-full bg-[var(--axon-syntax-function)]/60" />
          <span className="h-1.5 w-1.5 animate-[bounce_1.4s_infinite_0.2s] rounded-full bg-[var(--axon-syntax-function)]/60" />
          <span className="h-1.5 w-1.5 animate-[bounce_1.4s_infinite_0.4s] rounded-full bg-[var(--axon-syntax-function)]/60" />
        </span>
      ) : (
        <span className="h-1 w-1 rounded-full bg-[var(--axon-syntax-function)]/40" />
      )}
      <span>{label}</span>
    </div>
  );
}
