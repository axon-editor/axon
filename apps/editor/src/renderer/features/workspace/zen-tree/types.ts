/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ZenTreeEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface ZenProjectFile {
  name: string;
  path: string;
  is_dir: false;
}

export interface ZenSearchResult {
  file: ZenProjectFile;
  score: number;
}

export type GitTone = "added" | "modified" | "deleted" | "mixed";
