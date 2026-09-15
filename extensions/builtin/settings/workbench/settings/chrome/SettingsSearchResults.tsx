/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The dropdown under the settings search box. It answers "where is that
// setting?" with two tiers: matching pages (sections) and matching rows, each
// shown as a breadcrumb such as "Editor > Editor behavior > Auto Save" so the
// user knows exactly which control they are jumping to. Rows are more specific
// than pages, so both are offered but the popup keeps them visually separated.
import { ChevronRight } from "lucide-react";
import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "../lib/settingsData";
import { SETTINGS_SECTION_ICONS } from "../lib/sectionIcons";
import { type SettingsRowMatch } from "../search/settingsRowIndex";

export default function SettingsSearchResults({
  sectionIds,
  rows,
  onSelectSection,
  onSelectRow,
}: {
  sectionIds: SettingsSectionId[];
  rows: SettingsRowMatch[];
  onSelectSection: (sectionId: SettingsSectionId) => void;
  onSelectRow: (match: SettingsRowMatch) => void;
}) {
  const sections = sectionIds
    .map((id) => SETTINGS_SECTIONS.find((section) => section.id === id))
    .filter(
      (section): section is (typeof SETTINGS_SECTIONS)[number] =>
        Boolean(section),
    );

  const hasSections = sections.length > 0;
  const hasRows = rows.length > 0;

  if (!hasSections && !hasRows) {
    return (
      <div className="rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-3 py-6 text-center text-[12px] text-[var(--axon-editor-foreground)] opacity-45 shadow-2xl">
        No settings match that search.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] py-1 shadow-2xl">
      {hasSections && (
        <div>
          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--axon-editor-foreground)] opacity-40">
            Pages
          </div>
          {sections.map((section) => {
            const Icon = SETTINGS_SECTION_ICONS[section.id];
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onSelectSection(section.id)}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--axon-panel-overlay-hover)]"
              >
                <Icon
                  size={14}
                  className="shrink-0 text-[var(--axon-editor-foreground)] opacity-50"
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--axon-editor-foreground)]">
                  {section.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {hasSections && hasRows && (
        <div className="mx-3 my-1 border-t border-[var(--axon-panel-border)]" />
      )}

      {hasRows && (
        <div>
          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--axon-editor-foreground)] opacity-40">
            Settings
          </div>
          {rows.map((row) => {
            const sectionLabel =
              SETTINGS_SECTIONS.find(
                (section) => section.id === row.sectionId,
              )?.label ?? "";
            return (
              <button
                key={row.rowKey}
                type="button"
                onClick={() => onSelectRow(row)}
                className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-left transition-colors hover:bg-[var(--axon-panel-overlay-hover)]"
              >
                <ChevronRight
                  size={12}
                  className="shrink-0 text-[var(--axon-editor-foreground)] opacity-30"
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--axon-editor-foreground)]">
                  <span className="opacity-45">{sectionLabel}</span>
                  <span className="opacity-45"> &gt; </span>
                  {row.subgroup && (
                    <>
                      <span className="opacity-45">{row.subgroup}</span>
                      <span className="opacity-45"> &gt; </span>
                    </>
                  )}
                  <span className="font-medium">{row.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}