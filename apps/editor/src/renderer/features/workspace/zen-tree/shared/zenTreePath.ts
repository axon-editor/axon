/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function normalizeTreePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function getPathBasename(path: string | null) {
  if (!path) return "";
  const normalized = normalizeTreePath(path);
  return normalized.split("/").filter(Boolean).pop() ?? normalized;
}

export function getPathParent(path: string | null) {
  if (!path) return "";
  const normalized = normalizeTreePath(path);
  const parent = normalized.split("/").slice(0, -1).join("/");
  return parent || "/";
}

// The core returns one directory level at a time, so revealing the active file
// means expanding and fetching every directory between the workspace root and
// the file. The built paths keep the root's separator so they match the raw
// node.path values stored by the lazy child cache.
export function getAncestorPaths(filePath: string, rootPath: string) {
  const normalizedFile = normalizeTreePath(filePath);
  const normalizedRoot = normalizeTreePath(rootPath);
  if (!normalizedFile.startsWith(`${normalizedRoot}/`)) return [];

  const relative = normalizedFile.slice(normalizedRoot.length + 1);
  const segments = relative.split("/");
  segments.pop();

  const separator = rootPath.includes("\\") ? "\\" : "/";
  let current = rootPath.replace(/[\\/]+$/, "");
  return segments.map((segment) => {
    current = `${current}${separator}${segment}`;
    return current;
  });
}
