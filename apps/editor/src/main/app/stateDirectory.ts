/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app } from "electron";
import os from "node:os";
import path from "node:path";

// Axon keeps long-lived state outside Electron's userData because the Go core
// and the terminal CLI read the same files. Development uses its own root so an
// unpackaged launch can never overwrite the installed app's core identity,
// conversations, or agent configuration.
export const getAxonStateDirectory = () => {
  const override = process.env.AXON_STATE_DIR?.trim();
  if (override) return path.resolve(override);

  return path.join(os.homedir(), app.isPackaged ? ".axon" : ".axon-dev");
}
