/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Shared query splitting for settings search. Both the section matcher and the
// row matcher need the same rule: whitespace-separated tokens, lowercased, with
// one-character words dropped because they are noise while typing ("a", "i"),
// and keeping them would flash "everything matches" on the first keystroke.
export function tokenizeQuery(query: string) {
  const tokens = query.trim().toLowerCase().split(/\s+/);
  return tokens.filter((token) => token.length > 1);
}