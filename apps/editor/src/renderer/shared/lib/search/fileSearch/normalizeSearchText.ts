/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/[-_.\\/]+/g, " ");
}
