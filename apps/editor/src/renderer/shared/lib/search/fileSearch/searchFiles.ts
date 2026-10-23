/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { scoreFile } from "./scoreFile";
import type { ScoredFile, SearchableFile } from "./types";

export function searchFiles<T extends SearchableFile>(
  files: readonly T[],
  query: string,
  limit: number,
): ScoredFile<T>[] {
  const normalizedQuery = query.trim();

  return files
    .map((file) => ({ file, score: scoreFile(file, normalizedQuery) }))
    .filter((entry): entry is ScoredFile<T> => entry.score !== null)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.file.path.localeCompare(right.file.path),
    )
    .slice(0, limit);
}
