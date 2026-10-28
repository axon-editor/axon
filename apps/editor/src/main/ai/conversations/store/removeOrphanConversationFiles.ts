/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import path from "path";
import { isConversationFileName } from "../files/conversationFileName";

export function removeOrphanConversationFiles(
  directory: string,
  keep: Set<string>,
) {
  let entries: string[];
  try {
    entries = fs.readdirSync(directory);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!isConversationFileName(entry) || keep.has(entry)) continue;
    try {
      fs.rmSync(path.join(directory, entry), { force: true });
    } catch {
      // A leftover conversation file is harmless. The next full save will try
      // again, and failing to remove it must not block the new index.
    }
  }
}
