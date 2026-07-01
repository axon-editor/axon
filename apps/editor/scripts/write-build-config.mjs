import fs from "node:fs";
import path from "node:path";

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

loadEnvFile(path.resolve(process.cwd(), "../.env"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

const configPath = path.resolve(
  process.cwd(),
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
