/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { matchScore } from "./matchScore";
import { normalizeSearchText } from "./normalizeSearchText";
import type { SearchableFile } from "./types";

export function scoreFile(file: SearchableFile, query: string): number | null {
  const title = file.path.split(/[\\/]/).pop() ?? file.path;
  const normalizedQuery = normalizeSearchText(query);
  const titleScore = matchScore(title, query);
  const normalizedTitleScore = matchScore(
    normalizeSearchText(title),
    normalizedQuery,
  );
  const pathScore = matchScore(file.path, query);
  const normalizedPathScore = matchScore(
    normalizeSearchText(file.path),
    normalizedQuery,
  );
  const bestScore = Math.max(
    titleScore ?? -1,
    normalizedTitleScore ?? -1,
    pathScore !== null ? pathScore - 8 : -1,
    normalizedPathScore !== null ? normalizedPathScore - 8 : -1,
  );

  return bestScore < 0 ? null : bestScore;
}
