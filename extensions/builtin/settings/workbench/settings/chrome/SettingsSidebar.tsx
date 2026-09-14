/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The settings sidebar: search on top, grouped section navigation in the
// middle, and the save status pinned to the bottom. Groups keep the growing
// section list scannable instead of one flat list, and sections that match the
// current search stay visible while the rest of their group collapses. The
// active page gets an accent rail so users can locate it without depending on
// text color alone.
import {
  SETTINGS_GROUPS,
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "../lib/settingsData";
import { SETTINGS_SECTION_ICONS } from "../lib/sectionIcons";
import { type SettingsSearchMatch } from "../search/settingsSearch";
import SettingsSaveStatus from "./SettingsSaveStatus";
import SettingsSearchInput from "./SettingsSearchInput";
import { type SettingsSaveState } from "./types";

interface SettingsSidebarProps {
  activeSection: SettingsSectionId;
  query: string;
  queryMatches: SettingsSearchMatch[];
  saveState: SettingsSaveState;
  hasDirtyChanges: boolean;
  onSectionChange: (section: SettingsSectionId) => void;
  onQueryChange: (query: string) => void;
}

export default function SettingsSidebar({
  activeSection,
  query,
  queryMatches,
  saveState,
  hasDirtyChanges,
  onSectionChange,
  onQueryChange,
}: SettingsSidebarProps) {
  const matchedIds = new Set(queryMatches.map((match) => match.id));
  const matchCounts = new Map(
    queryMatches.map((match) => [match.id, match.matchCount]),
  );

  const visibleSections = SETTINGS_SECTIONS.filter(
    (section) => queryMatches.length === 0 || matchedIds.has(section.id),
  );

  const noResults = queryMatches.length > 0 && visibleSections.length === 0;

  return (
    <aside className="flex min-h-0 flex-col border-r border-[var(--axon-panel-border)] bg-[var(--axon-sidebar-background)]">
      <SettingsSearchInput value={query} onChange={onQueryChange} />

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-label="Settings sections">
        {SETTINGS_GROUPS.map((group) => {
          const groupSections = visibleSections.filter(
            (section) => section.group === group.id,
          );
          if (groupSections.length === 0) return null;

          return (
            <div key={group.id} className="mb-4 last:mb-0">
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--axon-editor-foreground)] opacity-40">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {groupSections.map((section) => {
                  const Icon = SETTINGS_SECTION_ICONS[section.id];
                  const active = section.id === activeSection;
                  const matchCount = matchCounts.get(section.id);

                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => onSectionChange(section.id)}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left transition-colors ${
                        active
                          ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                          : "text-[var(--axon-editor-foreground)] opacity-65 hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[var(--axon-editor-foreground)]"
                      }`}
                    >
                      {active && (
                        <span className="absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded-full bg-[var(--axon-accent)]" />
                      )}
                      <Icon
                        size={14}
                        className={`shrink-0 ${
                          active
                            ? "text-[var(--axon-accent)]"
                            : "text-[var(--axon-editor-foreground)] opacity-50"
                        }`}
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {section.label}
                      </span>
                      {matchCount && (
                        <span className="shrink-0 text-[10px] text-[var(--axon-editor-foreground)] opacity-40">
                          {matchCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {noResults && (
          <div className="px-3 py-6 text-center text-[12px] text-[var(--axon-editor-foreground)] opacity-45">
            No settings match that search.
          </div>
        )}
      </nav>

      <div className="shrink-0 border-t border-[var(--axon-panel-border)] px-4 py-3 text-[11px] text-[var(--axon-editor-foreground)]">
        <SettingsSaveStatus dirty={hasDirtyChanges} saveState={saveState} />
      </div>
    </aside>
  );
}