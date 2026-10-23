/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// All query characters must appear in order. This keeps loose editor-style
// searches such as "scm" for source control working without a full fuzzy
// scoring table.
export function fuzzyMatch(target: string, query: string): boolean {
  const normalizedTarget = target.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  let targetIndex = 0;

  for (let queryIndex = 0; queryIndex < normalizedQuery.length; queryIndex++) {
    while (
      targetIndex < normalizedTarget.length &&
      normalizedTarget[targetIndex] !== normalizedQuery[queryIndex]
    ) {
      targetIndex++;
    }
    if (targetIndex >= normalizedTarget.length) return false;
    targetIndex++;
  }

  return true;
}
