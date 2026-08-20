import { type Layout } from "./types";

// activatePane changes focus only when the requested pane is different. Pane
// surfaces receive bubbled click events for every interaction inside them, so
// returning a fresh layout for an already-active pane would make expensive
// children such as Markdown previews reconcile after every ordinary click.
// Preserving object identity here lets React bail out while still activating a
// real sibling pane when the user moves focus across a split editor.
export function activatePane(layout: Layout, paneId: string): Layout {
  if (layout.activePaneId === paneId) return layout;
  if (!layout.panes.some((pane) => pane.id === paneId)) return layout;

  return { ...layout, activePaneId: paneId };
}
