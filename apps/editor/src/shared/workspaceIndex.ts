export interface WorkspaceIndexFile {
  name: string;
  path: string;
  relativePath: string;
  extension: string;
  languageId: string | null;
  sizeBytes: number;
  modifiedAt: string;
}

export interface WorkspaceIndexSummary {
  workspacePath: string;
  generatedAt: string;
  indexedFileCount: number;
  truncated: boolean;
  languageCounts: Record<string, number>;
  files: WorkspaceIndexFile[];
}
