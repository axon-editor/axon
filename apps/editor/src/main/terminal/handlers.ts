/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcMain } from "electron";
import { readShellCommandHistory } from "./shellHistory";

export function registerTerminalHandlers() {
  // Command history is only ever used to build inline suggestions inside Axon
  // terminals. It is read on demand from the shell's own history file instead of
  // being persisted by Axon, so the corpus cannot drift from what the user's
  // shell would recall, and the renderer only receives the parsed command
  // strings rather than a path to the raw file.
  ipcMain.handle("terminal:getCommandHistory", async (): Promise<string[]> => {
    try {
      return await readShellCommandHistory();
    } catch {
      return [];
    }
  });
}
