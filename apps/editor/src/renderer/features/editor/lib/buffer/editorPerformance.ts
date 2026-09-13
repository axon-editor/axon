/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  markAxonPerformance,
  measureAxonPerformance,
} from "@axon-editor/renderer/shared/lib/performanceMarks";

let firstEditorMountMarked = false;

export function markEditorMounted(path: string) {
  markAxonPerformance("axon.editor.mount", { path });
  if (firstEditorMountMarked) return;

  firstEditorMountMarked = true;
  markAxonPerformance("axon.editor.firstMount", { path });
  measureAxonPerformance(
    "axon.timeToFirstEditor",
    "axon.renderer.boot.start",
    "axon.editor.firstMount",
  );
}
