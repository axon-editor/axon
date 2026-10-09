/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
