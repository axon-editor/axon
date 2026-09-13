/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const AXON_PROBLEMS_TAB_PATH = "axon://workbench/problems";

export function isProblemsTabPath(tabPath: string) {
  return tabPath === AXON_PROBLEMS_TAB_PATH;
}
