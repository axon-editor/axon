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
import { SPOTIFY_LIKED_SONGS_ID } from "@axon-editor/shared/spotify";

const POLL_INTERVAL_MS = 2000;
const DEVICE_PREFERENCE_KEY = "axon:spotifyDevicePreference";

// Liked Songs is not returned by Spotify's playlist endpoint. Axon presents it
// as a library entry so the existing track browser and pagination flow can be
// reused, while the loader still routes it to /me/tracks instead of treating it
// as a real playlist context.
const likedSongsPlaylist: SpotifyPlaylist = {
  id: SPOTIFY_LIKED_SONGS_ID,
  name: "Liked Songs",
  description: "Your saved Spotify tracks",
  images: [],
  tracks: { total: -1 },
  uri: "",
  owner: { display_name: "Spotify" },
};

interface DevicePreference {
  name: string;
  type: string;
}

function loadDevicePreference(): DevicePreference | null {
  try {
    const stored = localStorage.getItem(DEVICE_PREFERENCE_KEY);
    if (!stored) return null;
    const preference = JSON.parse(stored) as Partial<DevicePreference>;
    return typeof preference.name === "string" &&
      typeof preference.type === "string"
      ? { name: preference.name, type: preference.type }
      : null;
  } catch {
    return null;
  }
}

// Spotify documents device IDs as non-guaranteed cache keys. Persisting the
// human-readable name and type lets Axon restore a user's chosen device after
// Spotify rotates its ID, then resolve the fresh ID from the live device list
// before sending playback commands.
function saveDevicePreference(device: SpotifyDevice | null) {
  try {
    if (!device) {
      localStorage.removeItem(DEVICE_PREFERENCE_KEY);
      return;
    }
    localStorage.setItem(
      DEVICE_PREFERENCE_KEY,
      JSON.stringify({ name: device.name, type: device.type }),
    );
  } catch {
    return;
  }
}

function getNextOffset(next: string | null, fallback: number) {
  if (!next) return null;
  try {
    const offset = Number(new URL(next).searchParams.get("offset"));
    return Number.isFinite(offset) && offset >= 0 ? offset : fallback;
  } catch {
    return fallback;
  }
}

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
      const preference = loadDevicePreference();

      if (
        currentSelectedId &&
        selectableDevices.some((device) => device.id === currentSelectedId)
      ) {
        return currentSelectedId;
      }
      const preferredDevice = preference
        ? selectableDevices.find(
            (device) =>
              device.name === preference.name && device.type === preference.type,
          )
        : null;
      if (preferredDevice?.id) return preferredDevice.id;
      if (activeDevice?.id) return activeDevice.id;
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
          setSelectedDeviceId((currentDeviceId) =>
            currentDeviceId ?? result.state?.device?.id ?? null,
          );
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
        setPlaylists([
          likedSongsPlaylist,
          ...(r.ok
            ? r.playlists.filter(
                (playlist) => playlist.id !== SPOTIFY_LIKED_SONGS_ID,
              )
            : []),
        ]);
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
  }, []);

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
      const result =
        playlistId === SPOTIFY_LIKED_SONGS_ID
          ? await window.axon.spotify.getLikedTracks(0)
          : await window.axon.spotify.getPlaylistTracks(playlistId, 0);
      if (result.ok) {
        const items = result.items as SpotifyTrack[];
        setActivePlaylistTracks(items);
        setActivePlaylistTotal(result.total);
        setActivePlaylistNextOffset(
          getNextOffset(result.next, Math.min(items.length, result.total)),
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
      const result =
        activePlaylistId === SPOTIFY_LIKED_SONGS_ID
          ? await window.axon.spotify.getLikedTracks(activePlaylistNextOffset)
          : await window.axon.spotify.getPlaylistTracks(
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
          getNextOffset(
            result.next,
            Math.min(nextTracks.length, result.total),
          ),
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

  const selectDevice = useCallback(
    (deviceId: string | null) => {
      setSelectedDeviceId(deviceId);
      saveDevicePreference(
        devices.find((device) => device.id === deviceId) ?? null,
      );
    },
    [devices],
  );

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
    selectDevice,
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
