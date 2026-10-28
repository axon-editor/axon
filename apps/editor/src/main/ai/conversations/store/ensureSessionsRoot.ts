/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import path from "path";

const README = `# Axon agent conversations

Axon stores each workspace in a folder named \`<workspace-slug>-<hash>\`.

- \`workspace.json\` records the absolute workspace path.
- \`index.json\` caches the conversation list and the active conversation.
- \`conversation-<id>.json\` contains one conversation and its full timeline.

The conversation files hold the message content, and the index can be rebuilt
from them. The files are plain JSON so another agent can read them without Axon.
`;

export function ensureSessionsRoot(sessionsRoot: string) {
  fs.mkdirSync(sessionsRoot, { recursive: true, mode: 0o700 });
  const readmePath = path.join(sessionsRoot, "README.md");
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, README, { encoding: "utf8", mode: 0o600 });
  }
}
