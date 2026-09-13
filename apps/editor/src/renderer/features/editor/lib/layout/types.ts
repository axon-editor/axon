/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Core data types for the editor layout and pane management.
// Panes are independent editor instances each with their own tab list.
// Layout holds all panes and tracks which pane is currently focused.

export interface Pane {
  id: string;
  openTabs: string[];
  activeFile: string | null;
  dirtyFiles: Record<string, boolean>;
  pinnedTabs: string[];
}

export type SplitDirection = "right" | "left" | "up" | "down";

export interface Layout {
  panes: Pane[];
  activePaneId: string;
  splitDirection: "horizontal" | "vertical";
}
