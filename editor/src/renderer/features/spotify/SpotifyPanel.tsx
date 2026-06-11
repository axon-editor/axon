// Spotify sidebar panel, the browser side only.
// State is lifted to App.tsx via spotifyState/spotifyActions props so the
// floating player and this panel share one polling loop and one source of truth.
// No useSpotify call here, App owns it.

import { useCallback, useEffect, useState } from "react";
import SpotifyAuth from "./SpotifyAuth";
import SpotifyPlaylists from "./SpotifyPlaylists";
import type { SpotifyActions, SpotifyState } from "./lib/useSpotify";
import type { AxonSettings } from "../../../shared/settings";

function NowPlayingArtwork({
  src,
  alt,
}: {
  src?: string;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover"
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center">
      <svg width={12} height={12} viewBox="0 0 24 24" fill="#333">
        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
      </svg>
    </div>
  );
}

interface Props {
  visible: boolean;
  settings: AxonSettings;
  onUpdateSettings: (settings: AxonSettings) => Promise<void>;
  playerOpen: boolean;
  onTogglePlayer: () => void;
  spotifyState: SpotifyState;
  spotifyActions: SpotifyActions;
}

export default function SpotifyPanel({
  visible,
  settings,
  onUpdateSettings,
  playerOpen,
  onTogglePlayer,
  spotifyState: state,
  spotifyActions: actions,
}: Props) {
  const hasClientId = Boolean(settings.spotify?.clientId?.trim());

  // When OAuth callback fires, re-check status so panel transitions to browser.
  useEffect(() => {
    return window.axon.spotify.onConnected(() => {
      void actions.refreshStatus();
    });
  }, [actions.refreshStatus]);

  const handleSaveClientId = useCallback(
    async (clientId: string) => {
      await onUpdateSettings({ ...settings, spotify: { clientId } });
      await actions.refreshStatus();
    },
    [actions.refreshStatus, settings, onUpdateSettings],
  );

  if (state.statusLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div style={{ fontSize: 11, color: "#2a2e38" }}>Loading...</div>
      </div>
    );
  }

  if (!hasClientId || !state.status?.connected) {
    return (
      <SpotifyAuth
        hasClientId={hasClientId}
        onSaveClientId={handleSaveClientId}
        onConnect={actions.connect}
        error={state.error}
      />
    );
  }

  const track = state.playback?.item ?? null;
  const isPlaying = state.playback?.is_playing ?? false;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-hidden flex flex-col">
        <SpotifyPlaylists
          playlists={state.playlists}
          tracks={state.activePlaylistTracks}
          activePlaylistId={state.activePlaylistId}
          loadingTracks={state.loadingTracks}
          currentTrackId={track?.id ?? null}
          onLoadPlaylist={actions.loadPlaylistTracks}
          onBack={actions.clearPlaylistTracks}
          onPlay={actions.play}
        />
      </div>
      <div
        className="shrink-0 flex items-center gap-2 px-3"
        style={{
          height: 44,
          borderTop: "1px solid rgba(255,255,255,0.05)",
          background: "#090c12",
        }}
      >
        <div
          className="rounded shrink-0 overflow-hidden"
          style={{ width: 28, height: 28, background: "#111" }}
        >
          <NowPlayingArtwork
            src={track?.album.images[0]?.url}
            alt={track?.album.name ?? "Spotify artwork"}
          />
        </div>

        <div className="flex-1 min-w-0">
          {track ? (
            <>
              <div
                className="truncate text-white"
                style={{ fontSize: 10, fontWeight: 500 }}
              >
                {track.name}
              </div>
              <div
                className="truncate"
                style={{ fontSize: 9, color: "#586478" }}
              >
                {track.artists.map((a) => a.name).join(", ")}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 10, color: "#3a4050" }}>
              Nothing playing
            </div>
          )}
        </div>

        {isPlaying && (
          <div
            className="rounded-full shrink-0"
            style={{
              width: 5,
              height: 5,
              background: "#1db954",
              boxShadow: "0 0 5px #1db954",
            }}
          />
        )}

        <button
          className="flex items-center justify-center rounded cursor-pointer transition-colors shrink-0"
          style={{
            width: 24,
            height: 24,
            background: playerOpen ? "rgba(29,185,84,0.15)" : "transparent",
            border: playerOpen
              ? "1px solid rgba(29,185,84,0.3)"
              : "1px solid rgba(255,255,255,0.06)",
            color: playerOpen ? "#1db954" : "#586478",
          }}
          onClick={onTogglePlayer}
          title={playerOpen ? "Hide player" : "Show player"}
        >
          <svg width={11} height={11} viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 19H7V5h2v14zm4 2h-2V3h2v18zm4-5h-2V8h2v8z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
