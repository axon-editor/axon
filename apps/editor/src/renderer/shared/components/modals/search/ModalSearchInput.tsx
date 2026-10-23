/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Search is the first control in every navigation modal, so the input owns
// the icon, clear affordance, and focus behavior. Callers keep the query and
// decide what the results mean.
import {
  useCallback,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Search, X } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoFocus?: boolean;
  trailing?: ReactNode;
  className?: string;
  ariaLabel?: string;
  ariaControls?: string;
  ariaActiveDescendant?: string;
}

export default function ModalSearchInput({
  value,
  onChange,
  onKeyDown,
  placeholder = "Search",
  autoFocus = false,
  trailing,
  className = "",
  ariaLabel = "Search",
  ariaControls,
  ariaActiveDescendant,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const clear = useCallback(() => {
    onChange("");
    inputRef.current?.focus();
  }, [onChange]);

  return (
    <div
      className={`flex items-center gap-2 border-b border-[var(--axon-panel-border)] px-4 py-2 ${className}`}
    >
      <Search
        size={13}
        className="shrink-0 text-[var(--axon-editor-foreground)] opacity-45"
      />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-controls={ariaControls}
        aria-activedescendant={ariaActiveDescendant}
        className="min-w-0 flex-1 cursor-text bg-transparent text-[12px] text-[var(--axon-editor-foreground)] outline-none placeholder:text-[var(--axon-editor-foreground)] placeholder:opacity-35"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="shrink-0 cursor-pointer text-[var(--axon-editor-foreground)] opacity-40 transition-colors hover:opacity-80"
        >
          <X size={12} />
        </button>
      )}
      {trailing}
    </div>
  );
}
