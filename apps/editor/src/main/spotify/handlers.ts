// IPC handler registration for the Spotify feature.
// All Spotify main-process logic is imported from auth.ts and api.ts;
// this file only wires ipcMain.handle calls. No business logic lives here.

import { ipcMain } from "electron";
import {
  clearTokens,
  exchangeCodeForTokens,
  loadTokens,
  startAuthFlow,
} from "./auth";
import {
  getClientId,
  getDevices,
  getMe,
  getPlaybackState,
  getPlaylistTracks,
  getUserPlaylists,
  pause,
  play,
  seek,
  setClientId,
  setRepeat,
  setShuffle,
  setVolume,
  skipToNext,
  skipToPrevious,
} from "./api";
import type {
  SpotifyActionResult,
  SpotifyAuthResult,
  SpotifyDevicesResult,
  SpotifyPlaybackResult,
  SpotifyPlaylistsResult,
  SpotifyPlayTrackRequest,
  SpotifyStatusResult,
} from "../../shared/spotify";
import { readSettingsFromDisk } from "../settings/io";
import { getUserSettingsPath } from "../settings/paths";
import { AXON_SPOTIFY_CLIENT_ID } from "../generated/buildConfig";

// Called from index.ts after the app is ready and the client ID is set.
export function registerSpotifyHandlers(): void {
  // spotify:auth, opens the Spotify OAuth URL in the system browser.
  // The actual token exchange happens later via spotify:callback when the
  // axon:// protocol handler fires.
  ipcMain.handle("spotify:auth", async (): Promise<SpotifyAuthResult> => {
    // Try in-memory first, then fall back to reading settings from disk.
    // This covers the case where the user saved the client ID in this session
    // before settings:update had a chance to call setClientId.
    let clientId = getClientId();
    const bundledClientId = AXON_SPOTIFY_CLIENT_ID;
    if (!clientId && bundledClientId) {
      clientId = bundledClientId;
      setClientId(bundledClientId);
    }
    if (!clientId) {
      const settings = readSettingsFromDisk(getUserSettingsPath());
      clientId = settings?.spotify?.clientId ?? "";
      if (clientId) setClientId(clientId);
    }

    console.log(
      "[spotify] starting auth with clientId:",
      JSON.stringify(clientId),
    );

    try {
      if (!clientId) {
        return { ok: false, message: "Spotify client ID is not configured." };
      }
      await startAuthFlow(clientId);
      return { ok: true, message: "Spotify auth started in browser." };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Failed to start auth.",
      };
    }
  });

  // spotify:callback, receives the authorization code from the protocol handler
  // in index.ts. Exchanges for tokens and stores them.
  ipcMain.handle(
    "spotify:callback",
    async (_event, code: string): Promise<SpotifyAuthResult> => {
      const clientId = getClientId();
      if (!clientId) {
        return { ok: false, message: "Spotify client ID is not configured." };
      }

      try {
        const tokens = await exchangeCodeForTokens(clientId, code);
        if (!tokens) {
          return {
            ok: false,
            message: "Token exchange failed. Try connecting again.",
          };
        }
        return { ok: true, message: "Connected to Spotify." };
      } catch (err) {
        return {
          ok: false,
          message:
            err instanceof Error ? err.message : "Token exchange failed.",
        };
      }
    },
  );

  // spotify:status, returns whether the user is authenticated and their
  // display name. Used by the renderer to decide which view to show.
  ipcMain.handle("spotify:status", async (): Promise<SpotifyStatusResult> => {
    const tokens = loadTokens();
    if (!tokens) {
      return {
        connected: false,
        configured: Boolean(getClientId()),
        displayName: null,
        avatarUrl: null,
      };
    }

    const me = await getMe();
    if (!me) {
      return {
        connected: false,
        configured: Boolean(getClientId()),
        displayName: null,
        avatarUrl: null,
      };
    }

    return {
      connected: true,
      configured: true,
      displayName: me.display_name,
      avatarUrl: me.images[0]?.url ?? null,
    };
  });

  // spotify:disconnect, clears stored tokens and returns to the auth gate.
  ipcMain.handle("spotify:disconnect", (): SpotifyActionResult => {
    clearTokens();
    return { ok: true, message: "Disconnected from Spotify." };
  });

  ipcMain.handle(
    "spotify:playlists",
    async (): Promise<SpotifyPlaylistsResult> => {
      try {
        const playlists = await getUserPlaylists();
        return { ok: true, playlists };
      } catch (err) {
        return {
          ok: false,
          playlists: [],
          message:
            err instanceof Error ? err.message : "Failed to load playlists.",
        };
      }
    },
  );

  ipcMain.handle(
    "spotify:playlistTracks",
    async (
      _event,
      playlistId: string,
      offset: number,
    ): Promise<{
      ok: boolean;
      items: unknown[];
      total: number;
      next: string | null;
    }> => {
      try {
        const result = await getPlaylistTracks(playlistId, offset);
        return { ok: true, ...result };
      } catch (err) {
        return {
          ok: false,
          items: [],
          total: 0,
          next: null,
        };
      }
    },
  );

  ipcMain.handle(
    "spotify:playbackState",
    async (): Promise<SpotifyPlaybackResult> => {
      try {
        const state = await getPlaybackState();
        return { ok: true, state };
      } catch (err) {
        return {
          ok: false,
          state: null,
          message:
            err instanceof Error
              ? err.message
              : "Failed to get playback state.",
        };
      }
    },
  );

  ipcMain.handle("spotify:devices", async (): Promise<SpotifyDevicesResult> => {
    try {
      const devices = await getDevices();
      return { ok: true, devices };
    } catch (err) {
      return {
        ok: false,
        devices: [],
        message:
          err instanceof Error ? err.message : "Failed to load Spotify devices.",
      };
    }
  });

  ipcMain.handle(
    "spotify:play",
    async (
      _event,
      request: SpotifyPlayTrackRequest,
    ): Promise<SpotifyActionResult> => {
      try {
        const ok = await play(
          request.trackUri,
          request.contextUri,
          request.deviceId,
        );
        return {
          ok,
          message: ok
            ? "Playing."
            : "Playback command failed — no active Spotify device.",
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Play failed.",
        };
      }
    },
  );

  ipcMain.handle("spotify:pause", async (): Promise<SpotifyActionResult> => {
    try {
      const ok = await pause();
      return { ok, message: ok ? "Paused." : "Pause failed." };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Pause failed.",
      };
    }
  });

  ipcMain.handle("spotify:next", async (): Promise<SpotifyActionResult> => {
    try {
      const ok = await skipToNext();
      return { ok, message: ok ? "Skipped." : "Skip failed." };
    } catch (err) {
      return { ok: false, message: "Skip failed." };
    }
  });

  ipcMain.handle("spotify:previous", async (): Promise<SpotifyActionResult> => {
    try {
      const ok = await skipToPrevious();
      return { ok, message: ok ? "Previous." : "Previous failed." };
    } catch (err) {
      return { ok: false, message: "Previous failed." };
    }
  });

  ipcMain.handle(
    "spotify:seek",
    async (_event, positionMs: number): Promise<SpotifyActionResult> => {
      try {
        const ok = await seek(positionMs);
        return { ok, message: ok ? "Seeked." : "Seek failed." };
      } catch (err) {
        return { ok: false, message: "Seek failed." };
      }
    },
  );

  ipcMain.handle(
    "spotify:setVolume",
    async (_event, volumePercent: number): Promise<SpotifyActionResult> => {
      try {
        const ok = await setVolume(volumePercent);
        return { ok, message: ok ? "Volume set." : "Volume failed." };
      } catch (err) {
        return { ok: false, message: "Volume failed." };
      }
    },
  );

  ipcMain.handle(
    "spotify:setShuffle",
    async (_event, state: boolean): Promise<SpotifyActionResult> => {
      try {
        const ok = await setShuffle(state);
        return { ok, message: ok ? "Shuffle updated." : "Shuffle failed." };
      } catch (err) {
        return { ok: false, message: "Shuffle failed." };
      }
    },
  );

  ipcMain.handle(
    "spotify:setRepeat",
    async (
      _event,
      state: "off" | "track" | "context",
    ): Promise<SpotifyActionResult> => {
      try {
        const ok = await setRepeat(state);
        return { ok, message: ok ? "Repeat updated." : "Repeat failed." };
      } catch (err) {
        return { ok: false, message: "Repeat failed." };
      }
    },
  );
}
