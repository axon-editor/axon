/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
