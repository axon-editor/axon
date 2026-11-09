/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ContextEnabled {
  activeFile: boolean;
  diagnostics: boolean;
  gitChanges: boolean;
}

export const DEFAULT_CONTEXT_ENABLED: ContextEnabled = {
  activeFile: true,
  diagnostics: true,
  gitChanges: true,
};
