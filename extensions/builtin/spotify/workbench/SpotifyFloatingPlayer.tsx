// Floating now-playing player — draggable, lives at App level outside the
// sidebar so it can be placed anywhere on screen. Toggled via the equalizer
// button in the sidebar's now-playing bar.
//
// Drag handle is the album art area. Position persists to localStorage.
// Progress bar updates via requestAnimationFrame at 60fps between poll ticks.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  SpotifyDevice,
  SpotifyPlaybackState,
  SpotifyPlayTrackRequest,
} from "@axon-editor/shared/spotify";
import {
  Music2,
  Pause,
  Play,
  Repeat1,
  Repeat2,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from "lucide-react";
import SpotifyDeviceSelector from "./SpotifyDeviceSelector";
import SpotifyWave from "./SpotifyWave";

const POSITION_KEY = "axon:spotifyPlayerPos";
const DEFAULT_POS = { x: 24, y: 80 };

function loadPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_POS;
  } catch {
    return DEFAULT_POS;
  }
}

function savePos(pos: { x: number; y: number }) {
  localStorage.setItem(POSITION_KEY, JSON.stringify(pos));
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface Props {
  playback: SpotifyPlaybackState | null;
  onPlay: (r: SpotifyPlayTrackRequest) => Promise<void>;
  onPause: () => Promise<void>;
  onNext: () => Promise<void>;
  onPrevious: () => Promise<void>;
  onSeek: (ms: number) => Promise<void>;
  onSetVolume: (v: number) => Promise<void>;
  onSetShuffle: (s: boolean) => Promise<void>;
  onSetRepeat: (s: "off" | "track" | "context") => Promise<void>;
  devices: SpotifyDevice[];
  selectedDeviceId: string | null;
  loadingDevices: boolean;
  onSelectDevice: (deviceId: string | null) => void;
  onRefreshDevices: () => Promise<void>;
  onClose: () => void;
}

export default function SpotifyFloatingPlayer({
  playback,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onSeek,
  onSetVolume,
  onSetShuffle,
  onSetRepeat,
  devices,
  selectedDeviceId,
  loadingDevices,
  onSelectDevice,
  onRefreshDevices,
  onClose,
}: Props) {
  const playbackProgress = playback?.progress_ms ?? null;
  const playbackItemId = playback?.item?.id ?? null;
  const playbackDuration = playback?.item?.duration_ms ?? null;
  const playbackIsPlaying = playback?.is_playing ?? false;
  const [pos, setPos] = useState(loadPos);
  const [dragging, setDragging] = useState(false);
  const [seekHover, setSeekHover] = useState(false);
  const [volHover, setVolHover] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);
  const [artFailed, setArtFailed] = useState(false);

  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(Date.now());
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const playerRef = useRef<HTMLDivElement>(null);

  // Snap to server value on every poll tick.
  useEffect(() => {
    if (playbackProgress === null) return;
    setLocalProgress(playbackProgress);
    setArtFailed(false);
    lastTickRef.current = Date.now();
  }, [playbackItemId, playbackProgress]);

  // rAF loop for smooth progress bar.
  useEffect(() => {
    if (!playbackIsPlaying || playbackDuration === null) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }
    const duration = playbackDuration;
    const tick = () => {
      const now = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;
      setLocalProgress((p) =>
        Math.min(p + elapsed, duration),
      );
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playbackDuration, playbackIsPlaying, playbackItemId]);

  // Drag via pointer capture so moves don't break when leaving the element.
  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!playerRef.current) return;
    const rect = playerRef.current.getBoundingClientRect();
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onDragMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      setPos({
        x: e.clientX - dragOffsetRef.current.x,
        y: e.clientY - dragOffsetRef.current.y,
      });
    },
    [dragging],
  );

  const onDragEnd = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    setPos((p) => {
      savePos(p);
      return p;
    });
  }, [dragging]);

  const cycleRepeat = () => {
    const r = playback?.repeat_state ?? "off";
    void onSetRepeat(
      r === "off" ? "context" : r === "context" ? "track" : "off",
    );
  };

  const track = playback?.item ?? null;
  const duration = track?.duration_ms ?? 1;
  const progress = Math.min(localProgress, duration);
  const pct = (progress / duration) * 100;
  const volume = playback?.device?.volume_percent ?? 50;
  const isPlaying = playbackIsPlaying;
  const shuffle = playback?.shuffle_state ?? false;
  const repeat = playback?.repeat_state ?? "off";
  const art = track?.album.images[0]?.url ?? null;

  return (
    <div
      ref={playerRef}
      className="absolute z-50 select-none text-[var(--axon-editor-foreground)]"
      style={{
        left: pos.x,
        top: pos.y,
        width: 320,
        filter: "drop-shadow(0 12px 32px rgba(0,0,0,0.4))",
      }}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
    >
      <div className="overflow-hidden rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)]">
        <div
          className="relative w-full"
          style={{
            aspectRatio: "1/1",
            background: "var(--axon-panel-overlay-hover)",
            cursor: dragging ? "grabbing" : "grab",
          }}
          onPointerDown={onDragStart}
        >
          {art && !artFailed ? (
            <img
              src={art}
              alt={track?.album.name ?? ""}
              className="h-full w-full object-cover"
              draggable={false}
              onError={() => setArtFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Music2
                size={40}
                className="text-[var(--axon-editor-foreground)] opacity-20"
              />
            </div>
          )}

          <div className="absolute right-2.5 top-2.5 rounded border border-black/10 bg-black/55 px-1.5 py-1 text-white backdrop-blur-sm">
            <SpotifyWave
              active={isPlaying}
              label={track ? `Playing now · ${track.name}` : "Nothing playing"}
            />
          </div>

          <button
            className="absolute left-2.5 top-2.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-black/55 text-white opacity-70 backdrop-blur-sm transition-opacity hover:opacity-100"
            onClick={onClose}
            aria-label="Hide player"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <X size={13} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-3 py-3">
          <SpotifyDeviceSelector
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            loading={loadingDevices}
            compact
            onSelectDevice={onSelectDevice}
            onRefreshDevices={onRefreshDevices}
          />

          <div>
            <div className="truncate text-[12px] font-semibold text-[var(--axon-editor-foreground)]">
              {track?.name ?? "Nothing playing"}
            </div>
            <div className="mt-0.5 truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-45">
              {track?.artists.map((a) => a.name).join(", ") ?? ""}
            </div>
          </div>
          <div>
            <div
              className="relative h-1 cursor-pointer rounded-full bg-[var(--axon-panel-border)]"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                void onSeek(((e.clientX - rect.left) / rect.width) * duration);
              }}
              onMouseEnter={() => setSeekHover(true)}
              onMouseLeave={() => setSeekHover(false)}
            >
              <div
                className="absolute left-0 top-0 h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: seekHover
                    ? "var(--axon-syntax-function)"
                    : "var(--axon-editor-foreground)",
                  opacity: seekHover ? 1 : 0.55,
                  transition: "background 0.15s",
                }}
              />
              {seekHover && (
                <div
                  className="pointer-events-none absolute top-1/2 rounded-full"
                  style={{
                    left: `${pct}%`,
                    width: 9,
                    height: 9,
                    background: "var(--axon-editor-foreground)",
                    transform: "translate(-50%,-50%)",
                  }}
                />
              )}
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-[var(--axon-editor-foreground)] opacity-35">
              <span>{fmt(progress)}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label={shuffle ? "Disable shuffle" : "Enable shuffle"}
              className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded transition-colors hover:bg-[var(--axon-panel-overlay-hover)] ${shuffle ? "text-[var(--axon-syntax-function)]" : "text-[var(--axon-editor-foreground)] opacity-35"}`}
              onClick={() => void onSetShuffle(!shuffle)}
            >
              <Shuffle size={14} />
            </button>

            <button
              type="button"
              aria-label="Previous track"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-75 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
              onClick={() => void onPrevious()}
            >
              <SkipBack size={17} fill="currentColor" />
            </button>

            <button
              type="button"
              aria-label={isPlaying ? "Pause" : "Play"}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--axon-editor-foreground)] text-[var(--axon-editor-background)] transition-transform hover:scale-105 active:scale-95"
              onClick={() => (isPlaying ? void onPause() : void onPlay({}))}
            >
              {isPlaying ? (
                <Pause size={15} fill="currentColor" />
              ) : (
                <Play size={15} fill="currentColor" />
              )}
            </button>

            <button
              type="button"
              aria-label="Next track"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-75 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
              onClick={() => void onNext()}
            >
              <SkipForward size={17} fill="currentColor" />
            </button>

            <button
              type="button"
              aria-label={`Repeat ${repeat}`}
              className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded transition-colors hover:bg-[var(--axon-panel-overlay-hover)] ${repeat === "off" ? "text-[var(--axon-editor-foreground)] opacity-35" : "text-[var(--axon-syntax-function)]"}`}
              onClick={cycleRepeat}
            >
              {repeat === "track" ? (
                <Repeat1 size={14} />
              ) : (
                <Repeat2 size={14} />
              )}
            </button>
          </div>

          <div
            className="flex items-center gap-2"
            onMouseEnter={() => setVolHover(true)}
            onMouseLeave={() => setVolHover(false)}
          >
            <Volume2
              size={12}
              className="text-[var(--axon-editor-foreground)] opacity-40"
            />
            <div
              className="relative h-1 flex-1 cursor-pointer rounded-full bg-[var(--axon-panel-border)]"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                void onSetVolume(
                  Math.round(((e.clientX - rect.left) / rect.width) * 100),
                );
              }}
            >
              <div
                className="absolute left-0 top-0 h-full rounded-full"
                style={{
                  width: `${volume}%`,
                  background: volHover
                    ? "var(--axon-syntax-function)"
                    : "var(--axon-editor-foreground)",
                  opacity: volHover ? 1 : 0.4,
                  transition: "background 0.15s",
                }}
              />
            </div>
            <span className="min-w-[22px] text-right text-[9px] text-[var(--axon-editor-foreground)] opacity-35">
              {volume}%
            </span>
          </div>

          {playback?.device && (
            <div className="flex items-center justify-center gap-1.5 truncate text-center text-[9px] text-[var(--axon-editor-foreground)] opacity-35">
              <SpotifyWave active={isPlaying} className="scale-75" />
              <span className="truncate">{playback.device.name}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
