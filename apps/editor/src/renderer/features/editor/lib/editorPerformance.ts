import {
  markAxonPerformance,
  measureAxonPerformance,
} from "../../../shared/lib/performanceMarks";

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
