/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The settings search box. Escape clears the current query before the
// CommandModal-level Escape handler (which lives on document) closes the
// whole dialog, so the first press is always "undo the filter" and the second
// press genuinely leaves. Without stopPropagation the first Escape would
// close the modal while text is still visible, forcing an extra reopen cycle.
import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

export default function SettingsSearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (query: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // The modal opens on a keyboard command; focusing the field lets the user
  // type a term without clicking first, which is the most common first action
  // in a settings search.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const clear = () => onChange("");

  return (
    <div className="shrink-0 border-b border-[var(--axon-panel-border)] px-4 py-4">
      <div className="flex items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-3 py-2 focus-within:border-[var(--axon-accent)]">
        <Search
          size={14}
          className="shrink-0 text-[var(--axon-editor-foreground)] opacity-45"
        />
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && value) {
              event.preventDefault();
              event.stopPropagation();
              clear();
            }
          }}
          placeholder="Search settings..."
          aria-label="Search settings"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-40"
        />
        {value && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear settings search"
            className="cursor-pointer text-[var(--axon-editor-foreground)] opacity-40 transition-opacity hover:opacity-100"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}