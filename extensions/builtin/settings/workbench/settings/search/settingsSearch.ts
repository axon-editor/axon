/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Section search for the settings sidebar. The index is built once at module
// load so a keystroke only runs a cheap substring scan over seven entries
// instead of lowercasing and splitting strings on every input event. Matching
// is intentionally AND across the query words: "virtual env" must match both
// tokens so broad words do not drag unrelated sections into the result set.
import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "../lib/settingsData";
import { tokenizeQuery } from "./tokenize";

export interface SettingsSearchMatch {
  id: SettingsSectionId;
  // How many distinct query words landed on this section. The sidebar shows it
  // as a small count so a query like "cursor" is not a yes/no guess; two words
  // matching on the Editor page reads more relevant than one word elsewhere.
  matchCount: number;
}

interface SettingsSearchEntry {
  id: SettingsSectionId;
  label: string;
  haystack: string;
}

function buildSearchHaystack(
  label: string,
  description: string,
  keywords: string[],
) {
  // Labels and descriptions are authored for humans, so collapsing whitespace
  // and lowercasing once lets the hot path compare raw substrings.
  return ` ${[label, description, ...keywords]
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")} `;
}

const SEARCH_INDEX: SettingsSearchEntry[] = SETTINGS_SECTIONS.map((section) => ({
  id: section.id,
  label: section.label,
  haystack: buildSearchHaystack(
    section.label,
    section.description,
    section.keywords,
  ),
}));

export function matchSettingsSections(query: string): SettingsSearchMatch[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];

  return SEARCH_INDEX.flatMap((entry) => {
    const matchedTokens = tokens.filter((token) =>
      entry.haystack.includes(token),
    );
    return matchedTokens.length === tokens.length
      ? [{ id: entry.id, matchCount: matchedTokens.length }]
      : [];
  });
}