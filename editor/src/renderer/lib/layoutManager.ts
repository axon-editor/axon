// Pure functions for manipulating the editor layout state.
// All functions take the current layout and return a new layout.
// No side effects, state updates happen in App via setState.
import { type Layout, type Pane, type SplitDirection } from "./types";

const MAX_PANES = 5;

// generateId creates a simple unique pane ID
function generateId(): string {
  return `pane-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// createPane creates a new empty pane with optional initial file
export function createPane(activeFile?: string): Pane {
  return {
    id: generateId(),
    openTabs: activeFile ? [activeFile] : [],
    activeFile: activeFile ?? null,
    dirtyFiles: {},
  };
}

// createInitialLayout creates the default single pane layout
export function createInitialLayout(): Layout {
  const pane = createPane();
  return {
    panes: [pane],
    activePaneId: pane.id,
    splitDirection: "horizontal",
  };
}

// splitPane adds a new pane to the layout in the given direction.
// The new pane opens with the same active file as the source pane.
// Returns the same layout if MAX_PANES is already reached.
export function splitPane(
  layout: Layout,
  sourcePaneId: string,
  direction: SplitDirection,
  fileToOpen?: string,
): Layout {
  if (layout.panes.length >= MAX_PANES) return layout;

  const sourcePane = layout.panes.find((p) => p.id === sourcePaneId);
  const newPane = createPane(fileToOpen ?? sourcePane?.activeFile ?? undefined);

  // horizontal split = panes side by side (left/right)
  // vertical split = panes stacked (up/down)
  const splitDirection =
    direction === "left" || direction === "right" ? "horizontal" : "vertical";

  const sourceIndex = layout.panes.findIndex((p) => p.id === sourcePaneId);
  const newPanes = [...layout.panes];

  if (direction === "right" || direction === "down") {
    newPanes.splice(sourceIndex + 1, 0, newPane);
  } else {
    newPanes.splice(sourceIndex, 0, newPane);
  }

  return {
    ...layout,
    panes: newPanes,
    activePaneId: newPane.id,
    splitDirection,
  };
}

/// closePane removes a pane from the layout.
// If the closed pane was active, focus shifts to the nearest remaining pane.
// If it's the last pane, resets it to empty instead of blocking the close.
export function closePane(layout: Layout, paneId: string): Layout {
  if (layout.panes.length <= 1) {
    // reset the last pane to empty rather than blocking
    return {
      ...layout,
      panes: layout.panes.map((p) =>
        p.id === paneId
          ? { ...p, openTabs: [], activeFile: null, dirtyFiles: {} }
          : p,
      ),
    };
  }

  const index = layout.panes.findIndex((p) => p.id === paneId);
  const newPanes = layout.panes.filter((p) => p.id !== paneId);

  let newActivePaneId = layout.activePaneId;
  if (layout.activePaneId === paneId) {
    const nextIndex = Math.min(index, newPanes.length - 1);
    newActivePaneId = newPanes[nextIndex].id;
  }

  return {
    ...layout,
    panes: newPanes,
    activePaneId: newActivePaneId,
  };
}
// openFileInPane opens a file in a specific pane.
// Adds to tabs if not already open, sets as active.
export function openFileInPane(
  layout: Layout,
  paneId: string,
  filePath: string,
): Layout {
  return {
    ...layout,
    panes: layout.panes.map((p) => {
      if (p.id !== paneId) return p;
      const openTabs = p.openTabs.includes(filePath)
        ? p.openTabs
        : [...p.openTabs, filePath];
      return { ...p, openTabs, activeFile: filePath };
    }),
  };
}

// closeTabInPane removes a tab from a pane.
// If it was the active tab, focuses the nearest remaining tab.
// If no tabs remain, leaves the pane empty rather than closing it.
// Only closes the pane if there are multiple panes, a single pane
// always stays open even when empty.
export function closeTabInPane(
  layout: Layout,
  paneId: string,
  filePath: string,
): Layout {
  const pane = layout.panes.find((p) => p.id === paneId);
  if (!pane) return layout;

  const index = pane.openTabs.indexOf(filePath);
  const newTabs = pane.openTabs.filter((t) => t !== filePath);

  // if no tabs remain close the pane entirely.
  // closePane handles the last pane case by resetting to empty instead of removing it.
  if (newTabs.length === 0) {
    return closePane(layout, paneId);
  }

  let newActiveFile = pane.activeFile;
  if (pane.activeFile === filePath) {
    const nextIndex = Math.max(0, index - 1);
    newActiveFile = newTabs[nextIndex];
  }

  return {
    ...layout,
    panes: layout.panes.map((p) => {
      if (p.id !== paneId) return p;
      const newDirty = { ...p.dirtyFiles };
      delete newDirty[filePath];
      return {
        ...p,
        openTabs: newTabs,
        activeFile: newActiveFile,
        dirtyFiles: newDirty,
      };
    }),
  };
}

// reorderTabsInPane updates tab order after a drag reorder
export function reorderTabsInPane(
  layout: Layout,
  paneId: string,
  newTabs: string[],
): Layout {
  return {
    ...layout,
    panes: layout.panes.map((p) =>
      p.id === paneId ? { ...p, openTabs: newTabs } : p,
    ),
  };
}

// setActivePaneFile sets the active file in a pane and makes it the active pane
export function setActivePaneFile(
  layout: Layout,
  paneId: string,
  filePath: string,
): Layout {
  return {
    ...layout,
    activePaneId: paneId,
    panes: layout.panes.map((p) =>
      p.id === paneId ? { ...p, activeFile: filePath } : p,
    ),
  };
}

// setDirtyInPane updates dirty state for a file in a pane
export function setDirtyInPane(
  layout: Layout,
  paneId: string,
  filePath: string,
  dirty: boolean,
): Layout {
  return {
    ...layout,
    panes: layout.panes.map((p) => {
      if (p.id !== paneId) return p;
      const dirtyFiles = { ...p.dirtyFiles, [filePath]: dirty };
      return { ...p, dirtyFiles };
    }),
  };
}

// moveTabBetweenPanes moves a tab from one pane to another.
// If the source pane has no tabs left after the move, it gets closed.
export function moveTabBetweenPanes(
  layout: Layout,
  sourcePaneId: string,
  targetPaneId: string,
  filePath: string,
): Layout {
  if (sourcePaneId === targetPaneId) return layout;

  let newLayout = closeTabInPane(layout, sourcePaneId, filePath);
  newLayout = openFileInPane(newLayout, targetPaneId, filePath);
  return newLayout;
}
