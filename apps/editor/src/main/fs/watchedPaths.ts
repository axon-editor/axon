/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Reference-counted registry of file paths that have at least one active
// OS-level watcher across all editor windows. The FileWatcherManager calls
// retain(path) when registering a watcher and release(path) when tearing one
// down. The path stays in the map until every window that was watching it has
// released it (count drops to zero).
//
// The TextFileCache reads this map to decide whether it can trust a cached
// entry (path has a watcher, zero extra syscalls) or must stat and compare
// the fingerprint (no watcher, catches external edits that no one notified
// us about, e.g. background tabs, files outside the workspace, split-pane
// secondaries).
//
// This module exists to break what would otherwise be a circular import between
// watcher.ts (which imports textFileCache for invalidate) and textFileCache.ts
// (which needs to know watcher coverage). All reads and writes happen on the
// main-process event loop, so no locking is needed.

const referenceCounts = new Map<string, number>();

export function isPathWatched(filePath: string): boolean {
  return referenceCounts.get(filePath)! > 0;
}

export function retainWatchedPath(filePath: string) {
  referenceCounts.set(filePath, (referenceCounts.get(filePath) ?? 0) + 1);
}

export function releaseWatchedPath(filePath: string) {
  const current = referenceCounts.get(filePath) ?? 0;
  if (current <= 1) {
    referenceCounts.delete(filePath);
  } else {
    referenceCounts.set(filePath, current - 1);
  }
}

export function releaseAllWatchedPaths() {
  referenceCounts.clear();
}
