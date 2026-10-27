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
  // The PTY survives the handoff, so the new owner has to know whether Axon
  // already sent the one-time workspace cd/clear. Replaying it into a running
  // agent would submit the command as a prompt instead of a shell command.
  cwdSynced: boolean;
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