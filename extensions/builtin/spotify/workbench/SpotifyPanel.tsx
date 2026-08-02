// Spotify sidebar panel, the browser side only.
// State is lifted to App.tsx via spotifyState/spotifyActions props so the
// floating player and this panel share one polling loop and one source of truth.
// No useSpotify call here, App owns it.

import { useEffect, useState } from "react";
import { AudioLines, Music2 } from "lucide-react";
import Tooltip from "@axon-editor/renderer/shared/components/Tooltip";
import SpotifyAuth from "./SpotifyAuth";
import SpotifyDeviceSelector from "./SpotifyDeviceSelector";
import SpotifyPlaylists from "./SpotifyPlaylists";
import SpotifyWave from "./SpotifyWave";
import type { SpotifyActions, SpotifyState } from "./lib/useSpotify";

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
      <Music2
        size={12}
        className="text-[var(--axon-editor-foreground)] opacity-35"
      />
    </div>
  );
}

interface Props {
  visible: boolean;
  playerOpen: boolean;
  onTogglePlayer: () => void;
  spotifyState: SpotifyState;
  spotifyActions: SpotifyActions;
}

export default function SpotifyPanel({
  visible: _visible,
  playerOpen,
  onTogglePlayer,
  spotifyState: state,
  spotifyActions: actions,
}: Props) {
  const refreshStatus = actions.refreshStatus;

  // When OAuth callback fires, re-check status so panel transitions to browser.
  useEffect(() => {
    return window.axon.spotify.onConnected(() => {
      void refreshStatus();
    });
  }, [refreshStatus]);

  if (state.statusLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-[11px] text-[var(--axon-editor-foreground)] opacity-40">
          Loading...
        </div>
      </div>
    );
  }

  if (!state.status?.configured || !state.status?.connected) {
    return (
      <SpotifyAuth
        configured={state.status?.configured ?? false}
        onConnect={actions.connect}
        error={state.error}
      />
    );
  }

  const track = state.playback?.item ?? null;
  const isPlaying = state.playback?.is_playing ?? false;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <SpotifyDeviceSelector
        devices={state.devices}
        selectedDeviceId={state.selectedDeviceId}
        loading={state.loadingDevices}
        onSelectDevice={actions.selectDevice}
        onRefreshDevices={actions.refreshDevices}
      />
      <div className="flex-1 overflow-hidden flex flex-col">
        <SpotifyPlaylists
          playlists={state.playlists}
          tracks={state.activePlaylistTracks}
          activePlaylistId={state.activePlaylistId}
          totalTracks={state.activePlaylistTotal}
          hasMoreTracks={state.activePlaylistNextOffset !== null}
          loadingTracks={state.loadingTracks}
          loadingMoreTracks={state.loadingMoreTracks}
          currentTrackId={track?.id ?? null}
          onLoadPlaylist={actions.loadPlaylistTracks}
          onLoadMoreTracks={actions.loadMorePlaylistTracks}
          onBack={actions.clearPlaylistTracks}
          onPlay={actions.play}
        />
      </div>
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-t border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-3">
        <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-[var(--axon-panel-overlay-hover)]">
          <NowPlayingArtwork
            src={track?.album.images[0]?.url}
            alt={track?.album.name ?? "Spotify artwork"}
          />
        </div>

        <div className="flex-1 min-w-0">
          {track ? (
            <>
              <div className="truncate text-[11px] font-medium text-[var(--axon-editor-foreground)]">
                {track.name}
              </div>
              <div className="truncate text-[9px] text-[var(--axon-editor-foreground)] opacity-45">
                {track.artists.map((a) => a.name).join(", ")}
              </div>
            </>
          ) : (
            <div className="text-[10px] text-[var(--axon-editor-foreground)] opacity-40">
              Nothing playing
            </div>
          )}
        </div>

        <SpotifyWave
          active={isPlaying}
          label={track ? `Playing now · ${track.name}` : "Nothing playing"}
        />

        <Tooltip label={playerOpen ? "Hide player" : "Show player"} side="top">
          <button
            type="button"
            className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border transition-colors ${
              playerOpen
                ? "border-[var(--axon-syntax-function)] bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-syntax-function)]"
                : "border-[var(--axon-panel-border)] text-[var(--axon-editor-foreground)] opacity-55 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
            }`}
            onClick={onTogglePlayer}
            aria-label={playerOpen ? "Hide player" : "Show player"}
          >
            <AudioLines size={13} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
