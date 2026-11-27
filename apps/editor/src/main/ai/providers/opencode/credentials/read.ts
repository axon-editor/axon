/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

interface CredentialValue {
  type?: string;
  key?: string;
}

// OpenCode keeps account credentials inside its own database, not in a config
// file. Axon runs the managed server on a separate database to keep its
// sessions out of the user's OpenCode TUI, so the account key has to travel
// through the environment instead.
function defaultDatabasePath() {
  if (process.env.XDG_DATA_HOME) {
    return path.join(process.env.XDG_DATA_HOME, "opencode", "opencode.db");
  }
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "opencode", "opencode.db");
  }
  return path.join(os.homedir(), ".local", "share", "opencode", "opencode.db");
}

export function readOpenCodeApiKey() {
  return readKeyFromDatabase(defaultDatabasePath());
}

// Exported for tests so a temporary database can stand in for the user's.
export function readKeyFromDatabase(databasePath: string) {
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
    const row = database
      .prepare(
        "select value from credential where integration_id = ? and active = 1 order by time_updated desc limit 1",
      )
      .get("opencode-go") as { value?: string } | undefined;
    if (!row?.value) return "";

    const credential = JSON.parse(row.value) as CredentialValue;
    // Only stored API keys can be handed to the managed server. OAuth
    // credentials are refreshed through OpenCode's own login flow and cannot
    // be replayed as an environment key.
    return credential.type === "key" && typeof credential.key === "string"
      ? credential.key
      : "";
  } catch {
    // A missing database, a locked file, or an older schema all mean the same
    // thing here: there is no account key to inject, and the managed server
    // still starts on the free catalog.
    return "";
  } finally {
    database?.close();
  }
}
