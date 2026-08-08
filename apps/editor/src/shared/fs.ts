export type FolderChangeKind = "create" | "change" | "delete" | "unknown";

export interface FolderChange {
  path: string;
  kind: FolderChangeKind;
}

export interface FolderChangeEvent {
  path?: string;
  kind?: FolderChangeKind;
  changes?: FolderChange[];
}
