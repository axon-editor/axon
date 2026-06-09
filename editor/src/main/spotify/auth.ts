// Spotify PKCE OAuth flow, token storage, and refresh.
// The code verifier is stored via an explicit getter/setter (not a bare
// module-level variable) so it survives across CommonJS module boundaries
// without being silently reset by a duplicate require() call.

import * as crypto from "crypto";
import { app, shell } from "electron";
import * as fs from "fs";
import * as path from "path";
import type { SpotifyTokens } from "../../shared/spotify";

const SPOTIFY_SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
  "user-read-private",
].join(" ");

const REDIRECT_URI = "axon://spotify-callback";
const TOKEN_FILENAME = "spotify-tokens.json";

function getTokenPath(): string {
  return path.join(app.getPath("userData"), TOKEN_FILENAME);
}

// Store the verifier on the global object so it's shared across all
// CommonJS require() calls to this module. Module-level variables in
// CommonJS can end up isolated when the same file is required via different
// resolved paths (e.g. dist/main/spotify/auth.js required from two different
// callers with different relative paths), causing pendingCodeVerifier to be
// undefined in the open-url handler even though startAuthFlow set it.
const VERIFIER_KEY = "__axon_spotify_code_verifier__";

function getVerifier(): string | null {
  return (
    ((global as Record<string, unknown>)[VERIFIER_KEY] as string | null) ?? null
  );
}

function setVerifier(v: string | null): void {
  (global as Record<string, unknown>)[VERIFIER_KEY] = v;
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(96).toString("base64url");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return hash.toString("base64url");
}

export function loadTokens(): SpotifyTokens | null {
  const tokenPath = getTokenPath();
  try {
    if (!fs.existsSync(tokenPath)) return null;
    const raw = fs.readFileSync(tokenPath, "utf-8");
    return JSON.parse(raw) as SpotifyTokens;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: SpotifyTokens): void {
  const tokenPath = getTokenPath();
  fs.writeFileSync(tokenPath, JSON.stringify(tokens), { mode: 0o600 });
}

export function clearTokens(): void {
  const tokenPath = getTokenPath();
  try {
    if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
  } catch {}
}

export async function startAuthFlow(clientId: string): Promise<void> {
  const verifier = generateCodeVerifier();
  setVerifier(verifier);

  const challenge = await generateCodeChallenge(verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SPOTIFY_SCOPES,
    redirect_uri: REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
  console.log("[spotify] opening auth URL, verifier stored on global");
  await shell.openExternal(authUrl);
}

export async function exchangeCodeForTokens(
  clientId: string,
  code: string,
): Promise<SpotifyTokens | null> {
  const verifier = getVerifier();

  console.log(
    "[spotify] exchangeCodeForTokens — verifier present:",
    verifier !== null,
  );

  if (!verifier) {
    // The verifier is missing — either no auth flow was started in this
    // process session, or it was already consumed by a previous exchange.
    console.error("[spotify] no pending code verifier, cannot exchange token.");
    return null;
  }

  // Clear immediately so a replayed callback can't reuse the same verifier.
  setVerifier(null);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    code_verifier: verifier,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Spotify token exchange failed: ${response.status} ${text}`,
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const tokens: SpotifyTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  saveTokens(tokens);
  console.log("[spotify] tokens saved successfully");
  return tokens;
}

export async function refreshAccessToken(
  clientId: string,
  refreshToken: string,
): Promise<SpotifyTokens | null> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const tokens: SpotifyTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  saveTokens(tokens);
  return tokens;
}
