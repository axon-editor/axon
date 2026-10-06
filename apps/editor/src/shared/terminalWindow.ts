/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The shape both sides of the floating terminal handoff agree on. The editor
// serializes its sessions into this snapshot when the terminal leaves as a
// window, and the window turns the same snapshot back into its initial tabs
// when it adopts them. Everything here is plain structured-clone data so it can
// cross IPC without any shared runtime.

export type TerminalSurfaceDockMode = "show" | "hide";

export interface TerminalSurfaceTab {
  id: string;
  title: string;
  workingDirectory: string | null;
}

export interface TerminalWindowHandoff {
  workspaceRoot: string | null;
  tabs: TerminalSurfaceTab[];
  activeTabId: string | null;
  createNonce: number;
  dockMode: TerminalSurfaceDockMode;
}

export const TERMINAL_WINDOW_TITLE = "Axon - Terminal";
export const TERMINAL_WINDOW_SURFACE = "terminal";