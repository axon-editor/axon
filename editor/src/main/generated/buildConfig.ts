// Build-time values that are safe to ship in Axon.
// The Spotify OAuth flow uses PKCE, so the desktop app needs only a public
// client_id. The release workflow rewrites this file before tsc runs, while
// local development keeps the empty fallback unless the env var is provided.
export const AXON_SPOTIFY_CLIENT_ID = "";
