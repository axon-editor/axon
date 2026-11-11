/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import path from "path";

const README = `# Axon agent conversations

The shared conversation database is \`sessions.db\` in this folder. The Axon
editor and the \`axon\` terminal client both use it. Each workspace still keeps a
folder named \`<workspace-slug>-<hash>\` as a migration source and fallback.

- \`workspace.json\` records the absolute workspace path.
- \`index.json\` caches the conversation list and the active conversation.
- \`conversation-<id>.json\` contains one conversation and its full timeline.
- \`sqlite-migrated\` marks a workspace that has been imported into the database.

The JSON files hold the same message content and can rebuild the index if the
database is unavailable. They are plain JSON so another agent can read them
without Axon.
`;

export function ensureSessionsRoot(sessionsRoot: string) {
  fs.mkdirSync(sessionsRoot, { recursive: true, mode: 0o700 });
  const readmePath = path.join(sessionsRoot, "README.md");
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, README, { encoding: "utf8", mode: 0o600 });
  }
}
