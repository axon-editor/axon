// Central hook for all Spotify renderer state.
// Polls playback every 2s while the panel is visible.
// Exposes refreshStatus so SpotifyPanel can re-check after OAuth callback.

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SpotifyActionResult,
  SpotifyPlaybackState,
  SpotifyPlaylist,
  SpotifyPlayTrackRequest,
  SpotifyStatusResult,
  SpotifyTrack,
} from "../../../../shared/spotify";

const POLL_INTERVAL_MS = 2000;

export interface SpotifyState {
  status: SpotifyStatusResult | null;
  playback: SpotifyPlaybackState | null;
  playlists: SpotifyPlaylist[];
  activePlaylistTracks: SpotifyTrack[];
  activePlaylistId: string | null;
  loadingPlaylists: boolean;
  loadingTracks: boolean;
  statusLoading: boolean;
  error: string | null;
}

export interface SpotifyActions {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  play: (request: SpotifyPlayTrackRequest) => Promise<void>;
  pause: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  setVolume: (volumePercent: number) => Promise<void>;
  setShuffle: (state: boolean) => Promise<void>;
  setRepeat: (state: "off" | "track" | "context") => Promise<void>;
  loadPlaylistTracks: (playlistId: string) => Promise<void>;
  clearPlaylistTracks: () => void;
  refreshPlayback: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export function useSpotify(visible: boolean): [SpotifyState, SpotifyActions] {
  const [status, setStatus] = useState<SpotifyStatusResult | null>(null);
  const [playback, setPlayback] = useState<SpotifyPlaybackState | null>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [activePlaylistTracks, setActivePlaylistTracks] = useState<
    SpotifyTrack[]
  >([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const refreshPlayback = useCallback(async () => {
    try {
      const result = await window.axon.spotify.getPlaybackState();
      if (result.ok) setPlayback(result.state);
    } catch {
      // Transient error, keep last known state.
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    console.log("[spotify] refreshStatus called");
    setStatusLoading(true);
    try {
      const s = await window.axon.spotify.getStatus();
      setStatus(s);
      if (s.connected) {
        setLoadingPlaylists(true);
        const r = await window.axon.spotify.getPlaylists();
        if (r.ok) setPlaylists(r.playlists);
        setLoadingPlaylists(false);
      }
    } catch {
      setError("Could not reach Spotify.");
    } finally {
      setStatusLoading(false);
    }
  }, []);

  // Initial status check on mount.
  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // 2s polling loop, only while visible and connected.
  useEffect(() => {
    if (!status?.connected) return;

    void refreshPlayback();

    const interval = setInterval(() => {
      if (!visibleRef.current) return;
      void refreshPlayback();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [refreshPlayback, status?.connected]);

  const connect = useCallback(async () => {
    setError(null);
    const result = await window.axon.spotify.auth();
    if (!result.ok) setError(result.message);
  }, []);

  const disconnect = useCallback(async () => {
    await window.axon.spotify.disconnect();
    setStatus({ connected: false, displayName: null, avatarUrl: null });
    setPlayback(null);
    setPlaylists([]);
    setActivePlaylistTracks([]);
    setActivePlaylistId(null);
  }, []);

  const handleAction = useCallback(
    async (fn: () => Promise<SpotifyActionResult>) => {
      try {
        const result = await fn();
        if (!result.ok) setError(result.message);
        await refreshPlayback();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Playback error.");
      }
    },
    [refreshPlayback],
  );

  const loadPlaylistTracks = useCallback(async (playlistId: string) => {
    setLoadingTracks(true);
    setActivePlaylistId(playlistId);
    try {
      const result = await window.axon.spotify.getPlaylistTracks(playlistId, 0);
      if (result.ok) setActivePlaylistTracks(result.items as SpotifyTrack[]);
    } finally {
      setLoadingTracks(false);
    }
  }, []);

  const clearPlaylistTracks = useCallback(() => {
    setActivePlaylistTracks([]);
    setActivePlaylistId(null);
  }, []);

  const actions: SpotifyActions = {
    connect,
    disconnect,
    play: (r) => handleAction(() => window.axon.spotify.play(r)),
    pause: () => handleAction(() => window.axon.spotify.pause()),
    next: () => handleAction(() => window.axon.spotify.next()),
    previous: () => handleAction(() => window.axon.spotify.previous()),
    seek: (ms) => handleAction(() => window.axon.spotify.seek(ms)),
    setVolume: (v) => handleAction(() => window.axon.spotify.setVolume(v)),
    setShuffle: (s) => handleAction(() => window.axon.spotify.setShuffle(s)),
    setRepeat: (s) => handleAction(() => window.axon.spotify.setRepeat(s)),
    loadPlaylistTracks,
    clearPlaylistTracks,
    refreshPlayback,
    refreshStatus,
  };

  return [
    {
      status,
      playback,
      playlists,
      activePlaylistTracks,
      activePlaylistId,
      loadingPlaylists,
      loadingTracks,
      statusLoading,
      error,
    },
    actions,
  ];
}
