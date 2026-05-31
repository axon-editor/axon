// Core data types for the editor layout and pane management.
// Panes are independent editor instances each with their own tab list.
// Layout holds all panes and tracks which pane is currently focused.

export interface Pane {
  id: string;
  openTabs: string[];
  activeFile: string | null;
  dirtyFiles: Record<string, boolean>;
}

export type SplitDirection = "right" | "left" | "up" | "down";

export interface Layout {
  panes: Pane[];
  activePaneId: string;
  splitDirection: "horizontal" | "vertical";
}
