/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fuzzyMatch } from "./fuzzyMatch";

export function matchScore(target: string, query: string): number | null {
  const normalizedTarget = target.toLowerCase();
  const normalizedQuery = query.toLowerCase();

  if (!normalizedQuery) return 0;
  if (normalizedTarget === normalizedQuery) return 100;
  if (normalizedTarget.startsWith(normalizedQuery)) return 90;
  if (normalizedTarget.includes(` ${normalizedQuery}`)) return 82;
  if (normalizedTarget.includes(normalizedQuery)) return 70;
  if (fuzzyMatch(normalizedTarget, normalizedQuery)) return 45;

  return null;
}
