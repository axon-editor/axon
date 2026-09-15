/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Scrolls a settings row into view and briefly flashes it after a search result
// navigates to its section. The row may not be mounted yet when the popup item
// is clicked (the section changes in the same render), so callers run this on
// a later frame. The flash class is themed: it tints the row with the accent
// muted fill for a moment and then eases back to transparent.
export function revealSettingsRow(rowKey: string) {
  const row = document.querySelector<HTMLElement>(
    `[data-settings-row="${rowKey}"]`,
  );
  if (!row) return;

  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.classList.add("settings-row-flash");
  window.setTimeout(() => row.classList.remove("settings-row-flash"), 1400);
}