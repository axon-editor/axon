/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function flattenTree<T extends { is_dir: boolean; children?: T[] }>(
  node: T,
): T[] {
  if (!node.is_dir) return [node];
  return (node.children ?? []).flatMap(flattenTree);
}
