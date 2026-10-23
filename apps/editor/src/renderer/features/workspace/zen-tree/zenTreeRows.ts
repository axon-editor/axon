/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { FileNode } from "../../../shared/lib/backend/api";

export interface TreeRow {
  node: FileNode;
  depth: number;
}

export function sortChildren(children: FileNode[]) {
  return [...children].sort((left, right) => {
    if (left.is_dir !== right.is_dir) return left.is_dir ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

export function flattenRows(
  nodes: FileNode[],
  depth: number,
  expandedPaths: Set<string>,
  childrenByPath: Map<string, FileNode[]>,
  rows: TreeRow[] = [],
) {
  for (const node of nodes) {
    rows.push({ node, depth });

    if (node.is_dir && expandedPaths.has(node.path)) {
      const children = childrenByPath.get(node.path) ?? node.children ?? [];
      flattenRows(
        sortChildren(children),
        depth + 1,
        expandedPaths,
        childrenByPath,
        rows,
      );
    }
  }

  return rows;
}
