import { type FolderChangeEvent } from "../../../../../shared/fs";

export function folderChanges(event: FolderChangeEvent) {
  if (event.changes && event.changes.length > 0) return event.changes;
  return event.path
    ? [{ path: event.path, kind: event.kind ?? ("unknown" as const) }]
    : [];
}

function normalizeTreePath(value: string) {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

function parentTreePath(value: string) {
  const normalizedPath = normalizeTreePath(value);
  const separator = normalizedPath.lastIndexOf("/");
  return separator > 0 ? normalizedPath.slice(0, separator) : normalizedPath;
}

function isStructuralTreeChange(event: FolderChangeEvent) {
  return Boolean(event.path) && event.kind !== "change";
}

export function shouldReloadWorkspaceRoot(
  folderPath: string,
  event: FolderChangeEvent,
) {
  const rootPath = normalizeTreePath(folderPath);
  return folderChanges(event).some((change) => {
    if (!isStructuralTreeChange(change)) return false;
    const changedPath = normalizeTreePath(change.path);
    return changedPath === rootPath || parentTreePath(changedPath) === rootPath;
  });
}

export function shouldReloadFolderNode(
  folderPath: string,
  event: FolderChangeEvent,
) {
  const normalizedFolderPath = normalizeTreePath(folderPath);
  return folderChanges(event).some(
    (change) =>
      isStructuralTreeChange(change) &&
      parentTreePath(change.path) === normalizedFolderPath,
  );
}
