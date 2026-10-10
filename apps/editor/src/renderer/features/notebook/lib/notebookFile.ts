/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// isNotebookFile decides whether a tab should open in the notebook surface
// instead of the plain text editor. Only .ipynb documents are treated as
// notebooks; the extension is the same signal Jupyter and JupyterLab use.
export function isNotebookFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".ipynb");
}
