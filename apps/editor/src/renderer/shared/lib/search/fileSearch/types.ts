/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface SearchableFile {
  path: string;
}

export interface ScoredFile<T extends SearchableFile> {
  file: T;
  score: number;
}
