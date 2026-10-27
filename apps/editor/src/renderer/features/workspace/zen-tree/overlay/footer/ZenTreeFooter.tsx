/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface Hint {
  keys: string;
  label: string;
}

const TREE_HINTS: Hint[] = [
  { keys: "↑↓", label: "navigate" },
  { keys: "→", label: "expand" },
  { keys: "←", label: "collapse" },
  { keys: "↵", label: "open" },
  { keys: "esc", label: "close" },
];

const SEARCH_HINTS: Hint[] = [
  { keys: "↑↓", label: "navigate" },
  { keys: "↵", label: "open" },
  { keys: "esc", label: "clear" },
];

interface Props {
  searching: boolean;
  status?: string;
}

export default function ZenTreeFooter({ searching, status }: Props) {
  const hints = searching ? SEARCH_HINTS : TREE_HINTS;

  return (
    <footer className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[var(--axon-panel-border)] px-4 py-2">
      <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-40">
        {status}
      </span>
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
        {hints.map((hint) => (
          <span key={hint.label} className="flex items-center gap-1.5">
            <kbd className="rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 font-mono text-[9px] leading-none text-[var(--axon-editor-foreground)] opacity-60">
              {hint.keys}
            </kbd>
            <span className="text-[10px] text-[var(--axon-editor-foreground)] opacity-40">
              {hint.label}
            </span>
          </span>
        ))}
      </div>
    </footer>
  );
}
