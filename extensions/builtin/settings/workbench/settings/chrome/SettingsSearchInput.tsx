/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The settings search box with its result popup. Escape clears the current
// query before any global editor shortcut, so the first press is always "undo
// the filter" and a second press falls through to editor shortcuts. The
// settings tab itself stays open on Escape; leaving the page is the tab-bar X
// or the header/footer Close actions instead of a document-level handler.
//
// The popup opens as soon as the query has content and closes on selection,
// on Escape-clear, and on click-away. It does not need a toggle button: while
// the sidebar still filters sections live, the dropdown is the explicit
// "jump to a setting" list, and an empty query has nothing worth showing.
import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { Search, X } from "lucide-react";
import { type SettingsSectionId } from "../lib/settingsData";
import { type SettingsRowMatch } from "../search/settingsRowIndex";
import SettingsSearchResults from "./SettingsSearchResults";

export default function SettingsSearchInput({
  value,
  onChange,
  sectionIds,
  rows,
  onSelectSection,
  onSelectRow,
}: {
  value: string;
  onChange: (query: string) => void;
  sectionIds: SettingsSectionId[];
  rows: SettingsRowMatch[];
  onSelectSection: (sectionId: SettingsSectionId) => void;
  onSelectRow: (match: SettingsRowMatch) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [resultsOpen, setResultsOpen] = useState(false);

  // Opening settings is a keyboard command; focusing the field lets the user
  // type a term without clicking first, which is the most common first action
  // in a settings search.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close the dropdown when the user clicks anywhere outside it. The popup is
  // absolutely positioned over the section navigation, so it must not keep
  // capturing clicks once the pointer moves elsewhere.
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setResultsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const updateQuery = (nextQuery: string) => {
    onChange(nextQuery);
    setResultsOpen(nextQuery.trim().length > 0);
  };

  const clear = () => {
    updateQuery("");
    inputRef.current?.focus();
  };

  const selectSection = (sectionId: SettingsSectionId) => {
    onSelectSection(sectionId);
    setResultsOpen(false);
  };

  const selectRow = (match: SettingsRowMatch) => {
    onSelectRow(match);
    setResultsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className="relative shrink-0 border-b border-[var(--axon-panel-border)] px-4 py-4"
    >
      <div className="flex items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-3 py-2 focus-within:border-[var(--axon-accent)]">
        <Search
          size={14}
          className="shrink-0 text-[var(--axon-editor-foreground)] opacity-45"
        />
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => updateQuery(event.target.value)}
          onFocus={() => {
            if (value.trim().length > 0) setResultsOpen(true);
          }}
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
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              clear();
            }}
            aria-label="Clear settings search"
            className="cursor-pointer text-[var(--axon-editor-foreground)] opacity-40 transition-opacity hover:opacity-100"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {resultsOpen && (
        <div className="absolute left-4 right-4 top-full z-50 mt-1">
          <SettingsSearchResults
            sectionIds={sectionIds}
            rows={rows}
            onSelectSection={selectSection}
            onSelectRow={selectRow}
          />
        </div>
      )}
    </div>
  );
}