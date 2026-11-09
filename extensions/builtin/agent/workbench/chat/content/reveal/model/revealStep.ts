/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Revealing on every animation frame forced the whole markdown subtree to
// re-render up to sixty times a second while a token streamed. A timer gives
// the same typing effect at a fraction of the work.
const REVEAL_INTERVAL_MS = 50;
const REVEAL_CHARS_PER_TICK = 12;
const REVEAL_CATCH_UP_TICKS = 40;

export { REVEAL_INTERVAL_MS };

// A large final answer arrives as one delta when the agent reuses its planning
// turn. Revealing a fixed number of characters per tick would make a long
// answer take too long, so the step grows with the backlog and the whole reveal
// still finishes in roughly two seconds.
export function revealStep(remaining: number) {
  return Math.max(
    REVEAL_CHARS_PER_TICK,
    Math.ceil(remaining / REVEAL_CATCH_UP_TICKS),
  );
}
