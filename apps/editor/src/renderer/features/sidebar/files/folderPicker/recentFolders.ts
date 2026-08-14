import { useEffect, useState } from "react";

const RECENT_KEY = "axon:recentFolders";
const RECENT_CHANGED_EVENT = "axon:recentFoldersChanged";
const MAX_RECENT = 10;

interface RecentFolderRecord {
  path: string;
  lastOpenedAt: number;
}

function parseRecentFolders(): RecentFolderRecord[] {
  try {
    const rawValue = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    if (!Array.isArray(rawValue)) return [];

    return rawValue
      .map((item, index): RecentFolderRecord | null => {
        if (typeof item === "string") {
          return { path: item, lastOpenedAt: Date.now() - index };
        }
        if (
          typeof item === "object" &&
          item !== null &&
          typeof item.path === "string"
        ) {
          return {
            path: item.path,
            lastOpenedAt:
              typeof item.lastOpenedAt === "number"
                ? item.lastOpenedAt
                : Date.now() - index,
          };
        }
        return null;
      })
      .filter((item): item is RecentFolderRecord => item !== null);
  } catch {
    return [];
  }
}

function notifyCurrentWindow() {
  window.dispatchEvent(new Event(RECENT_CHANGED_EVENT));
}

function writeRecentFolders(records: RecentFolderRecord[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(records));
  notifyCurrentWindow();
}

export function addRecentFolder(path: string) {
  const records = parseRecentFolders().filter((record) => record.path !== path);
  writeRecentFolders(
    [{ path, lastOpenedAt: Date.now() }, ...records]
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
      .slice(0, MAX_RECENT),
  );
}

export function getRecentFolders(): string[] {
  return parseRecentFolders()
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, MAX_RECENT)
    .map((record) => record.path);
}

export function removeRecentFolder(path: string) {
  writeRecentFolders(
    parseRecentFolders().filter((record) => record.path !== path),
  );
}

export function clearRecentFolders() {
  localStorage.removeItem(RECENT_KEY);
  notifyCurrentWindow();
}

export function useRecentFolders(folderPickerOpen: boolean) {
  const [folders, setFolders] = useState(getRecentFolders);

  useEffect(() => {
    if (folderPickerOpen) setFolders(getRecentFolders());
  }, [folderPickerOpen]);

  useEffect(() => {
    const refresh = () => setFolders(getRecentFolders());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === RECENT_KEY) refresh();
    };

    // Browser storage events synchronize different Electron renderers but do
    // not fire in the document that performed the write. The local custom
    // event covers that missing half so every open picker follows one source
    // of truth regardless of which Axon window changed the history.
    window.addEventListener("storage", handleStorage);
    window.addEventListener(RECENT_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(RECENT_CHANGED_EVENT, refresh);
    };
  }, []);

  return folders;
}
