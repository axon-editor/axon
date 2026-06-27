// Thin fetch wrapper around the Spotify Web API.
// Every call goes through spotifyFetch which handles token expiry silently:
// if the stored token is within 60s of expiry it refreshes before the call,
// and if the API returns 401 it refreshes once and retries. This keeps all
// handlers free of token lifecycle code.

import {
  loadTokens,
  refreshAccessToken,
  saveTokens,
} from "./auth";
import type {
  SpotifyPlaybackState,
  SpotifyDevice,
  SpotifyPlaylist,
  SpotifyPlaylistTracksResult,
  SpotifyTrack,
} from "../../shared/spotify";

// Injected at startup from the settings or env. The client_id never changes
// for a given Axon build, it comes from the Spotify developer dashboard.
let _clientId: string | null = null;

export function setClientId(id: string): void {
  _clientId = id;
}

export function getClientId(): string | null {
  return _clientId;
}

// 60-second buffer before expiry, refresh proactively so we don't race
// a request against a token that will expire mid-flight.
const EXPIRY_BUFFER_MS = 60_000;

async function getValidAccessToken(): Promise<string | null> {
  const clientId = _clientId;
  if (!clientId) return null;

  let tokens = loadTokens();
  if (!tokens) return null;

  if (Date.now() >= tokens.expiresAt - EXPIRY_BUFFER_MS) {
    tokens = await refreshAccessToken(clientId, tokens.refreshToken);
    if (!tokens) return null;
    saveTokens(tokens);
  }

  return tokens.accessToken;
}

async function spotifyFetch(
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("Not authenticated with Spotify.");

  const makeRequest = (accessToken: string) =>
    fetch(`https://api.spotify.com/v1${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

  let response = await makeRequest(token);

  if (response.status === 401) {
    // Token may have been revoked or expired between our check and the request.
    // Attempt one silent refresh then retry, if it fails again, the session
    // is genuinely gone and the renderer needs to re-authenticate.
    const clientId = _clientId;
    const tokens = loadTokens();
    if (!clientId || !tokens) throw new Error("Not authenticated with Spotify.");

    const refreshed = await refreshAccessToken(clientId, tokens.refreshToken);
    if (!refreshed) throw new Error("Spotify session expired. Please reconnect.");

    response = await makeRequest(refreshed.accessToken);
  }

  return response;
}

export async function getMe(): Promise<{
  display_name: string;
  images: { url: string }[];
} | null> {
  try {
    const res = await spotifyFetch("/me");
    if (!res.ok) return null;
    return (await res.json()) as {
      display_name: string;
      images: { url: string }[];
    };
  } catch {
    return null;
  }
}

export async function getPlaybackState(): Promise<SpotifyPlaybackState | null> {
  try {
    const res = await spotifyFetch("/me/player");
    // 204 means Spotify is active but nothing is playing / no active device.
    if (res.status === 204) return null;
    if (!res.ok) return null;
    return (await res.json()) as SpotifyPlaybackState;
  } catch {
    return null;
  }
}

export async function getDevices(): Promise<SpotifyDevice[]> {
  const res = await spotifyFetch("/me/player/devices");
  if (!res.ok) return [];

  const data = (await res.json()) as { devices: SpotifyDevice[] };
  return data.devices;
}

export async function getUserPlaylists(): Promise<SpotifyPlaylist[]> {
  const playlists: SpotifyPlaylist[] = [];
  let url: string | null = "/me/playlists?limit=50";

  // Paginate through all playlists, the API caps each page at 50.
  while (url) {
    const endpoint = url.startsWith("https://")
      ? url.replace("https://api.spotify.com/v1", "")
      : url;

    const res = await spotifyFetch(endpoint);
    if (!res.ok) break;

    const page = (await res.json()) as {
      items: SpotifyPlaylist[];
      next: string | null;
    };
    playlists.push(...page.items);
    url = page.next;
  }

  return playlists;
}

export async function getPlaylistTracks(
  playlistId: string,
  offset = 0,
): Promise<SpotifyPlaylistTracksResult> {
  const res = await spotifyFetch(
    `/playlists/${playlistId}/tracks?limit=50&offset=${offset}&fields=items(track(id,name,duration_ms,artists,album,uri)),total,next`,
  );

  if (!res.ok) return { items: [], total: 0, next: null };

  const data = (await res.json()) as {
    items: { track: SpotifyTrack | null }[];
    total: number;
    next: string | null;
  };

  return {
    // Spotify can return null track entries for local files or unavailable items.
    items: data.items.map((i) => i.track).filter((t): t is SpotifyTrack => t !== null),
    total: data.total,
    next: data.next,
  };
}

export async function play(
  trackUri?: string,
  contextUri?: string,
  deviceId?: string | null,
): Promise<boolean> {
  const body: Record<string, unknown> = {};
  if (contextUri) {
    body.context_uri = contextUri;
    if (trackUri) {
      body.offset = { uri: trackUri };
    }
  } else if (trackUri) {
    body.uris = [trackUri];
  }

  const deviceQuery = deviceId
    ? `?device_id=${encodeURIComponent(deviceId)}`
    : "";
  const res = await spotifyFetch(`/me/player/play${deviceQuery}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

  return res.ok || res.status === 204;
}

export async function pause(): Promise<boolean> {
  const res = await spotifyFetch("/me/player/pause", { method: "PUT" });
  return res.ok || res.status === 204;
}

export async function skipToNext(): Promise<boolean> {
  const res = await spotifyFetch("/me/player/next", { method: "POST" });
  return res.ok || res.status === 204;
}

export async function skipToPrevious(): Promise<boolean> {
  const res = await spotifyFetch("/me/player/previous", { method: "POST" });
  return res.ok || res.status === 204;
}

export async function seek(positionMs: number): Promise<boolean> {
  const res = await spotifyFetch(
    `/me/player/seek?position_ms=${Math.floor(positionMs)}`,
    { method: "PUT" },
  );
  return res.ok || res.status === 204;
}

export async function setVolume(volumePercent: number): Promise<boolean> {
  const clamped = Math.max(0, Math.min(100, Math.floor(volumePercent)));
  const res = await spotifyFetch(
    `/me/player/volume?volume_percent=${clamped}`,
    { method: "PUT" },
  );
  return res.ok || res.status === 204;
}

export async function setShuffle(state: boolean): Promise<boolean> {
  const res = await spotifyFetch(`/me/player/shuffle?state=${state}`, {
    method: "PUT",
  });
  return res.ok || res.status === 204;
}

export async function setRepeat(
  state: "off" | "track" | "context",
): Promise<boolean> {
  const res = await spotifyFetch(`/me/player/repeat?state=${state}`, {
    method: "PUT",
  });
  return res.ok || res.status === 204;
}
