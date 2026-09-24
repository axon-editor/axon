/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(__dirname, "..", "..");
const repoRoot = path.resolve(editorRoot, "..", "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;

    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(path.resolve(repoRoot, ".env"));
loadEnvFile(path.resolve(editorRoot, ".env"));

const configPath = path.resolve(
  editorRoot,
  "src/main/generated/buildConfig.ts",
);
const spotifyClientId = process.env.SPOTIFY_CLIENT_ID ?? "";

fs.mkdirSync(path.dirname(configPath), { recursive: true });
fs.writeFileSync(
  configPath,
  `// Build-time values that are safe to ship in Axon.
// The Spotify OAuth flow uses PKCE, so the desktop app needs only a public
// client_id. The release workflow rewrites this file before tsc runs, while
// local development keeps the empty fallback unless the env var is provided.
export const AXON_SPOTIFY_CLIENT_ID = ${JSON.stringify(spotifyClientId)};
`,
);
