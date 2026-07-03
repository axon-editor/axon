// Central hook for all Spotify renderer state.
// Polls playback every 2s while the panel is visible.
// Exposes refreshStatus so SpotifyPanel can re-check after OAuth callback.

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SpotifyActionResult,
  SpotifyDevice,
  SpotifyPlaybackState,
  SpotifyPlaylist,
  SpotifyPlayTrackRequest,
  SpotifyStatusResult,
  SpotifyTrack,
} from "@axon-editor/shared/spotify";

const POLL_INTERVAL_MS = 2000;

export interface SpotifyState {
  status: SpotifyStatusResult | null;
  playback: SpotifyPlaybackState | null;
  devices: SpotifyDevice[];
  selectedDeviceId: string | null;
  playlists: SpotifyPlaylist[];
  activePlaylistTracks: SpotifyTrack[];
  activePlaylistId: string | null;
  activePlaylistTotal: number;
  activePlaylistNextOffset: number | null;
  loadingPlaylists: boolean;
  loadingTracks: boolean;
  loadingMoreTracks: boolean;
  loadingDevices: boolean;
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
  refreshDevices: () => Promise<void>;
  selectDevice: (deviceId: string | null) => void;
  loadPlaylistTracks: (playlistId: string) => Promise<void>;
  loadMorePlaylistTracks: () => Promise<void>;
  clearPlaylistTracks: () => void;
  refreshPlayback: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export function useSpotify(visible: boolean): [SpotifyState, SpotifyActions] {
  const [status, setStatus] = useState<SpotifyStatusResult | null>(null);
  const [playback, setPlayback] = useState<SpotifyPlaybackState | null>(null);
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [activePlaylistTracks, setActivePlaylistTracks] = useState<
    SpotifyTrack[]
  >([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [activePlaylistTotal, setActivePlaylistTotal] = useState(0);
  const [activePlaylistNextOffset, setActivePlaylistNextOffset] = useState<
    number | null
  >(null);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [loadingMoreTracks, setLoadingMoreTracks] = useState(false);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const chooseBestDeviceId = useCallback(
    (nextDevices: SpotifyDevice[], currentSelectedId: string | null) => {
      const selectableDevices = nextDevices.filter(
        (device) => device.id && !device.is_restricted,
      );
      const activeDevice = selectableDevices.find((device) => device.is_active);

      if (activeDevice?.id) return activeDevice.id;
      if (
        currentSelectedId &&
        selectableDevices.some((device) => device.id === currentSelectedId)
      ) {
        return currentSelectedId;
      }
      if (selectableDevices.length === 1) {
        return selectableDevices[0]?.id ?? null;
      }

      return null;
    },
    [],
  );

  const refreshDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const result = await window.axon.spotify.getDevices();
      if (!result.ok) return;

      setDevices(result.devices);
      setSelectedDeviceId((currentSelectedId) =>
        chooseBestDeviceId(result.devices, currentSelectedId),
      );
    } catch {
      // Device discovery is helpful but non-critical. Playback state polling
      // still runs even when Spotify Connect devices cannot be loaded.
    } finally {
      setLoadingDevices(false);
    }
  }, [chooseBestDeviceId]);

  const refreshPlayback = useCallback(async () => {
    try {
      const result = await window.axon.spotify.getPlaybackState();
      if (result.ok) {
        setPlayback(result.state);
        if (result.state?.device?.id) {
          setSelectedDeviceId(result.state.device.id);
        }
      }
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
        const [r] = await Promise.all([
          window.axon.spotify.getPlaylists(),
          refreshDevices(),
        ]);
        if (r.ok) setPlaylists(r.playlists);
        setLoadingPlaylists(false);
      }
    } catch {
      setError("Could not reach Spotify.");
    } finally {
      setStatusLoading(false);
    }
  }, [refreshDevices]);

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
  }, [status?.configured]);

  const disconnect = useCallback(async () => {
    await window.axon.spotify.disconnect();
    setStatus({
      connected: false,
      configured: status?.configured ?? false,
      displayName: null,
      avatarUrl: null,
    });
    setPlayback(null);
    setPlaylists([]);
    setDevices([]);
    setSelectedDeviceId(null);
    setActivePlaylistTracks([]);
    setActivePlaylistId(null);
    setActivePlaylistTotal(0);
    setActivePlaylistNextOffset(null);
  }, [status?.configured]);

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
    setActivePlaylistTracks([]);
    setActivePlaylistTotal(0);
    setActivePlaylistNextOffset(null);
    try {
      const result = await window.axon.spotify.getPlaylistTracks(playlistId, 0);
      if (result.ok) {
        const items = result.items as SpotifyTrack[];
        setActivePlaylistTracks(items);
        setActivePlaylistTotal(result.total);
        setActivePlaylistNextOffset(
          result.next ? Math.min(items.length, result.total) : null,
        );
      }
    } finally {
      setLoadingTracks(false);
    }
  }, []);

  const loadMorePlaylistTracks = useCallback(async () => {
    if (!activePlaylistId || activePlaylistNextOffset === null) return;
    if (loadingTracks || loadingMoreTracks) return;

    setLoadingMoreTracks(true);
    try {
      const result = await window.axon.spotify.getPlaylistTracks(
        activePlaylistId,
        activePlaylistNextOffset,
      );
      if (!result.ok) return;

      setActivePlaylistTracks((currentTracks) => {
        const nextTracks = [
          ...currentTracks,
          ...(result.items as SpotifyTrack[]),
        ];
        setActivePlaylistTotal(result.total);
        setActivePlaylistNextOffset(
          result.next ? Math.min(nextTracks.length, result.total) : null,
        );
        return nextTracks;
      });
    } finally {
      setLoadingMoreTracks(false);
    }
  }, [
    activePlaylistId,
    activePlaylistNextOffset,
    loadingMoreTracks,
    loadingTracks,
  ]);

  const clearPlaylistTracks = useCallback(() => {
    setActivePlaylistTracks([]);
    setActivePlaylistId(null);
    setActivePlaylistTotal(0);
    setActivePlaylistNextOffset(null);
  }, []);

  const actions: SpotifyActions = {
    connect,
    disconnect,
    play: (r) =>
      handleAction(() =>
        window.axon.spotify.play({
          ...r,
          deviceId: r.deviceId ?? selectedDeviceId,
        }),
      ),
    pause: () => handleAction(() => window.axon.spotify.pause()),
    next: () => handleAction(() => window.axon.spotify.next()),
    previous: () => handleAction(() => window.axon.spotify.previous()),
    seek: (ms) => handleAction(() => window.axon.spotify.seek(ms)),
    setVolume: (v) => handleAction(() => window.axon.spotify.setVolume(v)),
    setShuffle: (s) => handleAction(() => window.axon.spotify.setShuffle(s)),
    setRepeat: (s) => handleAction(() => window.axon.spotify.setRepeat(s)),
    refreshDevices,
    selectDevice: setSelectedDeviceId,
    loadPlaylistTracks,
    loadMorePlaylistTracks,
    clearPlaylistTracks,
    refreshPlayback,
    refreshStatus,
  };

  return [
    {
      status,
      playback,
      devices,
      selectedDeviceId,
      playlists,
      activePlaylistTracks,
      activePlaylistId,
      activePlaylistTotal,
      activePlaylistNextOffset,
      loadingPlaylists,
      loadingTracks,
      loadingMoreTracks,
      loadingDevices,
      statusLoading,
      error,
    },
    actions,
  ];
}
