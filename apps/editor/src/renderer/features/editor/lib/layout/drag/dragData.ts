/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const FILE_TREE_DRAG_TYPE = "application/x-axon-file-tree-entry";

export interface FileTreeDragPayload {
  path: string;
  isDir: boolean;
}

export function encodeFileTreeDragPayload(payload: FileTreeDragPayload) {
  return JSON.stringify(payload);
}

export function decodeFileTreeDragPayload(
  value: string,
): FileTreeDragPayload | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<FileTreeDragPayload>;
    if (typeof parsed.path !== "string") return null;
    if (typeof parsed.isDir !== "boolean") return null;
    return { path: parsed.path, isDir: parsed.isDir };
  } catch {
    return null;
  }
}
