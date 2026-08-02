// First-run screen inside the sidebar Spotify view.
// Axon owns the Spotify OAuth application, so normal users should only see a
// connect button. If Spotify is not configured yet, the copy still reads like
// an Axon feature surface instead of leaking build details into the UI.

interface Props {
  configured: boolean;
  onConnect: () => Promise<void>;
  error: string | null;
}

export default function SpotifyAuth({
  configured,
  onConnect,
  error,
}: Props) {
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div className="flex items-center gap-2.5">
        <div
          className="flex items-center justify-center rounded-full shrink-0"
          style={{ width: 28, height: 28, background: "var(--axon-syntax-function)" }}
        >
          <svg
            width={15}
            height={15}
            viewBox="0 0 24 24"
            fill="var(--axon-editor-background)"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.65 14.35c-.19.31-.6.41-.91.21-2.49-1.52-5.63-1.87-9.33-1.02-.36.08-.71-.14-.79-.5-.08-.36.14-.71.5-.79 4.04-.92 7.51-.52 10.32 1.19.31.19.41.6.21.91zm1.24-2.76c-.24.38-.74.5-1.12.27-2.85-1.75-7.19-2.26-10.56-1.24-.43.13-.89-.11-1.02-.54-.13-.43.11-.89.54-1.02 3.85-1.17 8.63-.6 11.9 1.41.38.24.5.74.26 1.12zm.11-2.88C14.75 8.8 9.25 8.6 6.03 9.62c-.52.16-1.07-.13-1.23-.65-.16-.52.13-1.07.65-1.23 3.69-1.12 9.83-.9 13.71 1.43.47.28.62.88.34 1.35-.28.47-.88.62-1.35.34z" />
          </svg>
        </div>
        <div>
          <div className="text-[12px] font-semibold text-[var(--axon-editor-foreground)]">
            Spotify
          </div>
          <div className="text-[10px] text-[var(--axon-editor-foreground)] opacity-40">
            Requires Premium
          </div>
        </div>
      </div>

      {!configured ? (
        <>
          <div className="text-[11px] leading-[1.6] text-[var(--axon-editor-foreground)] opacity-55">
            Listen to your favorite songs while you build. Spotify for Axon is
            almost ready in this workspace.
          </div>

          {error && (
            <div className="rounded border border-[var(--axon-danger-foreground)] bg-[var(--axon-danger-background)] px-3 py-2 text-[11px] text-[var(--axon-danger-foreground)]">
              {error}
            </div>
          )}

          <div className="rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-3 py-2 text-[10px] leading-5 text-[var(--axon-editor-foreground)] opacity-45">
            Connect Spotify to keep your favorite songs close while you build.
          </div>
        </>
      ) : (
        <>
          <div className="text-[11px] leading-[1.6] text-[var(--axon-editor-foreground)] opacity-55">
            Connect your Spotify account to control playback without leaving
            Axon.
          </div>

          {error && (
            <div className="rounded border border-[var(--axon-danger-foreground)] bg-[var(--axon-danger-background)] px-3 py-2 text-[11px] text-[var(--axon-danger-foreground)]">
              {error}
            </div>
          )}

          <button
            className="flex h-[30px] w-full cursor-pointer items-center justify-center gap-2 rounded bg-[var(--axon-syntax-function)] text-[11px] font-semibold text-[var(--axon-editor-background)] transition-opacity hover:opacity-90 active:opacity-70"
            style={{
              border: "none",
            }}
            onClick={() => void onConnect()}
          >
            Connect with Spotify
          </button>

          <div className="text-center text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
            Opens in your browser
          </div>
        </>
      )}
    </div>
  );
}
