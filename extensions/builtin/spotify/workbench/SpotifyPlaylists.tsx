// Playlist browser, sidebar-native, full height scroll.
// Lists playlists, click to see tracks, back to return.

import { useCallback, useState, type UIEvent } from "react";
import { ChevronLeft, ChevronRight, Music2 } from "lucide-react";
import type {
  SpotifyPlaylist,
  SpotifyPlayTrackRequest,
  SpotifyTrack,
} from "@axon-editor/shared/spotify";
import { SPOTIFY_LIKED_SONGS_ID } from "@axon-editor/shared/spotify";
import SpotifyWave from "./SpotifyWave";

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function MusicFallbackIcon({ size = 14 }: { size?: number }) {
  return (
    <Music2
      size={size}
      className="text-[var(--axon-editor-foreground)] opacity-35"
    />
  );
}

function SpotifyArtwork({
  src,
  alt,
  size = 14,
}: {
  src?: string;
  alt: string;
  size?: number;
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
      <MusicFallbackIcon size={size} />
    </div>
  );
}

interface Props {
  playlists: SpotifyPlaylist[];
  tracks: SpotifyTrack[];
  activePlaylistId: string | null;
  totalTracks: number;
  hasMoreTracks: boolean;
  loadingTracks: boolean;
  loadingMoreTracks: boolean;
  currentTrackId: string | null;
  onLoadPlaylist: (playlistId: string) => Promise<void>;
  onLoadMoreTracks: () => Promise<void>;
  onBack: () => void;
  onPlay: (request: SpotifyPlayTrackRequest) => Promise<void>;
}

export default function SpotifyPlaylists({
  playlists,
  tracks,
  activePlaylistId,
  totalTracks,
  hasMoreTracks,
  loadingTracks,
  loadingMoreTracks,
  currentTrackId,
  onLoadPlaylist,
  onLoadMoreTracks,
  onBack,
  onPlay,
}: Props) {
  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null;
  const handleTracksScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (!hasMoreTracks || loadingTracks || loadingMoreTracks) return;

      const target = event.currentTarget;
      const distanceFromBottom =
        target.scrollHeight - target.scrollTop - target.clientHeight;
      if (distanceFromBottom > 160) return;

      void onLoadMoreTracks();
    },
    [hasMoreTracks, loadingMoreTracks, loadingTracks, onLoadMoreTracks],
  );

  if (activePlaylistId && activePlaylist) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--axon-panel-border)] px-3 py-2">
          <button
            type="button"
            aria-label="Back to playlists"
            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-55 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
            onClick={onBack}
          >
            <ChevronLeft size={13} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-semibold text-[var(--axon-editor-foreground)]">
              {activePlaylist.name}
            </div>
            <div className="text-[9px] text-[var(--axon-editor-foreground)] opacity-40">
              {tracks.length || loadingTracks
                ? `${tracks.length}/${totalTracks || activePlaylist.tracks.total} tracks`
                : `${activePlaylist.tracks.total} tracks`}
            </div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1" onScroll={handleTracksScroll}>
          {loadingTracks ? (
            <div className="px-3 py-3 text-[11px] text-[var(--axon-editor-foreground)] opacity-40">
              Loading tracks...
            </div>
          ) : tracks.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-[var(--axon-editor-foreground)] opacity-40">
              No tracks found
            </div>
          ) : (
            <>
              {tracks.map((track, index) => {
                const isActive = track.id === currentTrackId;
                return (
                  <button
                    key={`${track.id}-${index}`}
                    className="flex h-10 w-full cursor-pointer items-center gap-2.5 px-3 text-left text-[var(--axon-editor-foreground)] transition-colors hover:bg-[var(--axon-panel-overlay-hover)]"
                    onClick={() =>
                      void onPlay({
                        trackUri: track.uri,
                        contextUri:
                          activePlaylist.id === SPOTIFY_LIKED_SONGS_ID
                            ? undefined
                            : activePlaylist.uri,
                      })
                    }
                  >
                    <div className="flex w-[18px] shrink-0 items-center justify-center text-[9px]">
                      {isActive ? (
                        <SpotifyWave active className="scale-75" />
                      ) : (
                        <span className="opacity-30">{index + 1}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`truncate text-[11px] ${isActive ? "font-semibold text-[var(--axon-syntax-function)]" : "text-[var(--axon-editor-foreground)]"}`}
                      >
                        {track.name}
                      </div>
                      <div className="truncate text-[9px] text-[var(--axon-editor-foreground)] opacity-40">
                        {track.artists.map((artist) => artist.name).join(", ")}
                      </div>
                    </div>
                    <div className="shrink-0 text-[9px] opacity-30">
                      {formatMs(track.duration_ms)}
                    </div>
                  </button>
                );
              })}
              {loadingMoreTracks && (
                <div className="px-3 py-3 text-[10px] text-[var(--axon-editor-foreground)] opacity-40">
                  Loading more tracks...
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Playlist list
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="shrink-0 border-b border-[var(--axon-panel-border)] px-3 py-2">
        <span className="text-[10px] font-semibold uppercase text-[var(--axon-editor-foreground)] opacity-45">
          Playlists
        </span>
      </div>
      <div className="overflow-y-auto flex-1">
        {playlists.length === 0 ? (
          <div className="px-3 py-3 text-[11px] text-[var(--axon-editor-foreground)] opacity-40">
            No playlists found
          </div>
        ) : (
          playlists.map((playlist) => (
            <button
              key={playlist.id}
              className="flex h-11 w-full cursor-pointer items-center gap-2.5 px-3 text-left text-[var(--axon-editor-foreground)] transition-colors hover:bg-[var(--axon-panel-overlay-hover)]"
              onClick={() => void onLoadPlaylist(playlist.id)}
            >
              <div className="h-[30px] w-[30px] shrink-0 overflow-hidden rounded bg-[var(--axon-panel-overlay-hover)]">
                <SpotifyArtwork
                  src={playlist.images[0]?.url}
                  alt={playlist.name}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-medium text-[var(--axon-editor-foreground)]">
                  {playlist.name}
                </div>
                <div className="text-[9px] text-[var(--axon-editor-foreground)] opacity-40">
                  {playlist.id === SPOTIFY_LIKED_SONGS_ID
                    ? "Saved tracks"
                    : `${playlist.tracks.total} tracks`}
                </div>
              </div>
              <ChevronRight size={11} className="shrink-0 opacity-30" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
