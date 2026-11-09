/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Shiki highlighting is async and expensive. Waiting for a short pause keeps a
// streamed code block from starting a new highlight job on every token while
// still finishing quickly once the answer settles.
export const HIGHLIGHT_DEBOUNCE_MS = 120;
