// Playlist browser, sidebar-native, full height scroll.
// Lists playlists, click to see tracks, back to return.

import { useState } from "react";
import type {
  SpotifyPlaylist,
  SpotifyPlayTrackRequest,
  SpotifyTrack,
} from "../../../../shared/spotify";

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function MusicFallbackIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#333">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
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
  loadingTracks: boolean;
  currentTrackId: string | null;
  onLoadPlaylist: (playlistId: string) => Promise<void>;
  onBack: () => void;
  onPlay: (request: SpotifyPlayTrackRequest) => Promise<void>;
}

export default function SpotifyPlaylists({
  playlists,
  tracks,
  activePlaylistId,
  loadingTracks,
  currentTrackId,
  onLoadPlaylist,
  onBack,
  onPlay,
}: Props) {
  const [hoveredTrack, setHoveredTrack] = useState<string | null>(null);
  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null;

  if (activePlaylistId && activePlaylist) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div
          className="flex items-center gap-2 px-3 py-2 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
          <button
            className="flex items-center justify-center rounded cursor-pointer transition-colors hover:bg-white/5 shrink-0"
            style={{ width: 22, height: 22 }}
            onClick={onBack}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="#888">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-white font-semibold truncate" style={{ fontSize: 11 }}>
              {activePlaylist.name}
            </div>
            <div style={{ fontSize: 9, color: "#555" }}>
              {activePlaylist.tracks.total} tracks
            </div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: "none" }}>
          {loadingTracks ? (
            <div className="px-3 py-3 text-[11px] text-[#3a4050]">
              Loading tracks...
            </div>
          ) : tracks.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-[#3a4050]">
              No tracks found
            </div>
          ) : (
            tracks.map((track, index) => {
              const isActive = track.id === currentTrackId;
              const isHovered = hoveredTrack === track.id;

              return (
                <button
                  key={track.id}
                  className="w-full flex items-center gap-2.5 px-3 text-left cursor-pointer transition-colors"
                  style={{
                    height: 40,
                    background: isHovered ? "rgba(255,255,255,0.03)" : "transparent",
                    border: "none",
                  }}
                  onMouseEnter={() => setHoveredTrack(track.id)}
                  onMouseLeave={() => setHoveredTrack(null)}
                  onClick={() =>
                    void onPlay({ trackUri: track.uri, contextUri: activePlaylist.uri })
                  }
                >
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 14, fontSize: 9 }}
                  >
                    {isActive ? (
                      <div
                        className="rounded-full"
                        style={{
                          width: 5,
                          height: 5,
                          background: "#1db954",
                          boxShadow: "0 0 5px #1db954",
                        }}
                      />
                    ) : (
                      <span style={{ color: "#333" }}>{index + 1}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate"
                      style={{
                        fontSize: 11,
                        color: isActive ? "#1db954" : "#c8d0e0",
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {track.name}
                    </div>
                    <div className="truncate" style={{ fontSize: 9, color: "#3a4050" }}>
                      {track.artists.map((a) => a.name).join(", ")}
                    </div>
                  </div>
                  <div style={{ fontSize: 9, color: "#333", flexShrink: 0 }}>
                    {formatMs(track.duration_ms)}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // Playlist list
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div
        className="px-3 py-2 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <span style={{ fontSize: 10, color: "#586478", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Playlists
        </span>
      </div>
      <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: "none" }}>
        {playlists.length === 0 ? (
          <div className="px-3 py-3 text-[11px] text-[#3a4050]">
            No playlists found
          </div>
        ) : (
          playlists.map((playlist) => (
            <button
              key={playlist.id}
              className="w-full flex items-center gap-2.5 px-3 text-left cursor-pointer transition-colors hover:bg-white/[0.03]"
              style={{ height: 44, border: "none", background: "transparent" }}
              onClick={() => void onLoadPlaylist(playlist.id)}
            >
              <div
                className="rounded shrink-0 overflow-hidden"
                style={{ width: 30, height: 30, background: "#111", flexShrink: 0 }}
              >
                <SpotifyArtwork
                  src={playlist.images[0]?.url}
                  alt={playlist.name}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-white" style={{ fontSize: 11, fontWeight: 500 }}>
                  {playlist.name}
                </div>
                <div style={{ fontSize: 9, color: "#3a4050" }}>
                  {playlist.tracks.total} tracks
                </div>
              </div>
              <svg width={10} height={10} viewBox="0 0 24 24" fill="#333">
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              </svg>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
