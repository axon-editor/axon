/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function summarizeSpawnFailure({ label, result }) {
  const details = [];
  if (result.error) details.push(`spawn error: ${result.error.message}`);
  if (typeof result.status === "number") details.push(`exit status: ${result.status}`);
  if (result.signal) details.push(`signal: ${result.signal}`);

  const cause = details.length > 0 ? details.join(", ") : "unknown failure";
  console.error(`[build] ${label} failed (${cause}).`);
}
