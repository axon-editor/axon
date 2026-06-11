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
  SpotifyPlaybackState,
  SpotifyPlayTrackRequest,
} from "../../../shared/spotify";
import { X } from "lucide-react";

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
  onClose,
}: Props) {
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
    if (!playback) return;
    setLocalProgress(playback.progress_ms);
    setArtFailed(false);
    lastTickRef.current = Date.now();
  }, [playback?.progress_ms, playback?.item?.id]);

  // rAF loop for smooth progress bar.
  useEffect(() => {
    if (!playback?.is_playing || !playback.item) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }
    const duration = playback.item.duration_ms;
    const tick = () => {
      const now = Date.now();
      lastTickRef.current = now;
      setLocalProgress((p) =>
        Math.min(p + (now - lastTickRef.current), duration),
      );
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playback?.is_playing, playback?.item?.id]);

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
  const isPlaying = playback?.is_playing ?? false;
  const shuffle = playback?.shuffle_state ?? false;
  const repeat = playback?.repeat_state ?? "off";
  const art = track?.album.images[0]?.url ?? null;

  return (
    <div
      ref={playerRef}
      className="absolute z-50 select-none"
      style={{
        left: pos.x,
        top: pos.y,
        width: 280,
        filter: "drop-shadow(0 12px 40px rgba(0,0,0,0.7))",
      }}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
    >
      <div
        style={{
          background: "linear-gradient(160deg, #141414 0%, #111318 100%)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <div
          className="relative w-full"
          style={{
            aspectRatio: "1/1",
            background: "#0a0c10",
            cursor: dragging ? "grabbing" : "grab",
          }}
          onPointerDown={onDragStart}
        >
          {art && !artFailed ? (
            <img
              src={art}
              alt={track?.album.name ?? ""}
              className="w-full h-full object-cover"
              draggable={false}
              onError={() => setArtFailed(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg width={40} height={40} viewBox="0 0 24 24" fill="#1a1e26">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          )}

          {isPlaying && (
            <div
              className="absolute rounded-full"
              style={{
                top: 10,
                right: 10,
                width: 7,
                height: 7,
                background: "#1db954",
                boxShadow: "0 0 8px #1db954",
              }}
            />
          )}

          <button
            className="absolute flex items-center justify-center rounded-full cursor-pointer transition-opacity opacity-60 hover:opacity-100"
            style={{
              top: 10,
              left: 10,
              width: 22,
              height: 22,
              background: "rgba(0,0,0,0.55)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#ccc",
              fontSize: 14,
              lineHeight: 1,
            }}
            onClick={onClose}
            title="Hide player"
            onPointerDown={(e) => e.stopPropagation()} // don't start drag
          >
            <X />
          </button>

          <div
            className="absolute bottom-2 left-0 right-0 text-center pointer-events-none"
            style={{ fontSize: 9, color: "rgba(255,255,255,0.15)" }}
          >
            drag to move
          </div>
        </div>

        <div className="flex flex-col gap-3 px-3 py-3">
          <div>
            <div
              className="text-white font-semibold truncate"
              style={{ fontSize: 12, letterSpacing: "-0.01em" }}
              title={track?.name ?? "Nothing playing"}
            >
              {track?.name ?? "Nothing playing"}
            </div>
            <div
              className="truncate"
              style={{ fontSize: 10, color: "#586478", marginTop: 2 }}
            >
              {track?.artists.map((a) => a.name).join(", ") ?? ""}
            </div>
          </div>
          <div>
            <div
              className="relative rounded-full cursor-pointer"
              style={{ height: 3, background: "rgba(255,255,255,0.1)" }}
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
                  background: seekHover ? "#1db954" : "rgba(255,255,255,0.5)",
                  transition: "background 0.15s",
                }}
              />
              {seekHover && (
                <div
                  className="absolute top-1/2 rounded-full pointer-events-none"
                  style={{
                    left: `${pct}%`,
                    width: 9,
                    height: 9,
                    background: "#fff",
                    transform: "translate(-50%,-50%)",
                  }}
                />
              )}
            </div>
            <div
              className="flex justify-between mt-1"
              style={{ fontSize: 9, color: "#3a4050" }}
            >
              <span>{fmt(progress)}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              className="cursor-pointer transition-opacity"
              style={{ opacity: shuffle ? 1 : 0.35, padding: 3 }}
              onClick={() => void onSetShuffle(!shuffle)}
              title={shuffle ? "Shuffle on" : "Shuffle off"}
            >
              <svg
                width={13}
                height={13}
                viewBox="0 0 24 24"
                fill={shuffle ? "#1db954" : "#ccc"}
              >
                <path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17zm4.76-.08 3.65 3.91-3.65 3.91V14h-1.89l-4.1-4.1 1.42-1.42 3.57 3.57V9.09h2zm0 10.91v-1.92L20 14l-4.65-4.98V7.1h-2v2.92L9.41 14l3.94 3.98V20h2z" />
              </svg>
            </button>

            <button
              className="cursor-pointer hover:opacity-70 transition-opacity"
              style={{ opacity: 0.8, padding: 3 }}
              onClick={() => void onPrevious()}
            >
              <svg width={17} height={17} viewBox="0 0 24 24" fill="#fff">
                <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
              </svg>
            </button>

            <button
              className="flex items-center justify-center rounded-full cursor-pointer transition-transform hover:scale-105 active:scale-95"
              style={{
                width: 36,
                height: 36,
                background: "#fff",
                border: "none",
                flexShrink: 0,
              }}
              onClick={() => (isPlaying ? void onPause() : void onPlay({}))}
            >
              {isPlaying ? (
                <svg width={14} height={14} viewBox="0 0 24 24" fill="#000">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg width={14} height={14} viewBox="0 0 24 24" fill="#000">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <button
              className="cursor-pointer hover:opacity-70 transition-opacity"
              style={{ opacity: 0.8, padding: 3 }}
              onClick={() => void onNext()}
            >
              <svg width={17} height={17} viewBox="0 0 24 24" fill="#fff">
                <path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z" />
              </svg>
            </button>

            <button
              className="cursor-pointer transition-opacity"
              style={{ opacity: repeat === "off" ? 0.35 : 1, padding: 3 }}
              onClick={cycleRepeat}
              title={`Repeat: ${repeat}`}
            >
              {repeat === "track" ? (
                <svg width={13} height={13} viewBox="0 0 24 24" fill="#1db954">
                  <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2v-5h-1l-2 1v1h1.5v3H13z" />
                </svg>
              ) : (
                <svg
                  width={13}
                  height={13}
                  viewBox="0 0 24 24"
                  fill={repeat !== "off" ? "#1db954" : "#ccc"}
                >
                  <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
                </svg>
              )}
            </button>
          </div>

          <div
            className="flex items-center gap-2"
            onMouseEnter={() => setVolHover(true)}
            onMouseLeave={() => setVolHover(false)}
          >
            <svg width={11} height={11} viewBox="0 0 24 24" fill="#444">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
            <div
              className="relative flex-1 rounded-full cursor-pointer"
              style={{ height: 3, background: "rgba(255,255,255,0.08)" }}
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
                  background: volHover ? "#1db954" : "rgba(255,255,255,0.3)",
                  transition: "background 0.15s",
                }}
              />
            </div>
            <span
              style={{
                fontSize: 9,
                color: "#333",
                minWidth: 22,
                textAlign: "right",
              }}
            >
              {volume}%
            </span>
          </div>

          {playback?.device && (
            <div
              className="truncate text-center"
              style={{ fontSize: 9, color: "#2a2e38" }}
            >
              ▶ {playback.device.name}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
