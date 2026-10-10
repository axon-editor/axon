/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type NotebookDocument } from "./nbformat";
import { type CellRuntime } from "../session/useKernelSession";

// mergeRuntimeIntoDocument folds the live kernel session's outputs and execution
// counts back into the notebook document. The document keeps the outputs loaded
// from disk, while the session holds the freshest run; merging at render and save
// time keeps streaming output out of the document's identity so typing in one
// cell never forces every other cell's output subtree to reconcile.
export function mergeRuntimeIntoDocument(
  document: NotebookDocument,
  cellRuntime: Record<string, CellRuntime>,
): NotebookDocument {
  let changed = false;
  const cells = document.cells.map((cell) => {
    if (cell.cell_type !== "code") return cell;
    const runtime = cellRuntime[cell.id];
    if (!runtime) return cell;
    if (
      runtime.outputs.length === (cell.outputs?.length ?? 0) &&
      runtime.executionCount === cell.execution_count
    ) {
      return cell;
    }
    changed = true;
    return {
      ...cell,
      outputs: runtime.outputs,
      execution_count: runtime.executionCount ?? cell.execution_count ?? null,
    };
  });
  return changed ? { ...document, cells } : document;
}
