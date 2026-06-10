// First-run screen inside the sidebar Spotify view.
// Two-step: no client ID → text input to paste it → save → connect button.
// If auth fails with "not configured", the input reappears automatically.

import { useState } from "react";

interface Props {
  hasClientId: boolean;
  onSaveClientId: (id: string) => Promise<void>;
  onConnect: () => Promise<void>;
  error: string | null;
}

export default function SpotifyAuth({
  hasClientId,
  onSaveClientId,
  onConnect,
  error,
}: Props) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // Show the setup input if no client ID is saved, or if the last error
  // indicates the client ID is missing or invalid, lets the user correct it
  // without needing to clear settings manually.
  const showSetup =
    !hasClientId ||
    (error != null && error.toLowerCase().includes("not configured"));

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSaveClientId(trimmed);
      setDraft("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div className="flex items-center gap-2.5">
        <div
          className="flex items-center justify-center rounded-full shrink-0"
          style={{ width: 28, height: 28, background: "#1db954" }}
        >
          <svg width={15} height={15} viewBox="0 0 24 24" fill="#000">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.65 14.35c-.19.31-.6.41-.91.21-2.49-1.52-5.63-1.87-9.33-1.02-.36.08-.71-.14-.79-.5-.08-.36.14-.71.5-.79 4.04-.92 7.51-.52 10.32 1.19.31.19.41.6.21.91zm1.24-2.76c-.24.38-.74.5-1.12.27-2.85-1.75-7.19-2.26-10.56-1.24-.43.13-.89-.11-1.02-.54-.13-.43.11-.89.54-1.02 3.85-1.17 8.63-.6 11.9 1.41.38.24.5.74.26 1.12zm.11-2.88C14.75 8.8 9.25 8.6 6.03 9.62c-.52.16-1.07-.13-1.23-.65-.16-.52.13-1.07.65-1.23 3.69-1.12 9.83-.9 13.71 1.43.47.28.62.88.34 1.35-.28.47-.88.62-1.35.34z" />
          </svg>
        </div>
        <div>
          <div className="text-white font-semibold" style={{ fontSize: 12 }}>
            Spotify
          </div>
          <div style={{ fontSize: 10, color: "#555" }}>Requires Premium</div>
        </div>
      </div>

      {showSetup ? (
        <>
          <div style={{ fontSize: 11, color: "#586478", lineHeight: 1.6 }}>
            Paste your Spotify app client ID. Get one at{" "}
            <button
              className="cursor-pointer hover:underline"
              style={{
                color: "#1db954",
                background: "none",
                border: "none",
                padding: 0,
                fontSize: "inherit",
              }}
              onClick={() =>
                void window.axon.openExternalLink(
                  "https://developer.spotify.com/dashboard",
                )
              }
            >
              developer.spotify.com
            </button>
            . Add{" "}
            <code
              className="rounded px-1"
              style={{
                fontSize: 10,
                background: "#111",
                color: "#80c8e0",
                border: "1px solid #222",
              }}
            >
              axon://spotify-callback
            </code>{" "}
            as a redirect URI.
          </div>

          {error && (
            <div
              className="rounded px-3 py-2"
              style={{
                fontSize: 11,
                color: "#f87171",
                background: "rgba(248,113,113,0.08)",
                border: "1px solid rgba(248,113,113,0.15)",
              }}
            >
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSave();
              }}
              placeholder="Paste client ID here"
              className="w-full rounded px-3 outline-none"
              style={{
                height: 32,
                fontSize: 11,
                background: "#0d0f14",
                border: "1px solid #222838",
                color: "#c8d0e0",
                fontFamily: "monospace",
              }}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              className="w-full flex items-center justify-center rounded font-semibold transition-opacity cursor-pointer hover:opacity-90 active:opacity-70"
              style={{
                height: 30,
                fontSize: 11,
                background: draft.trim() ? "#1db954" : "#1a2a1a",
                color: draft.trim() ? "#000" : "#3a4a3a",
                border: "none",
              }}
              disabled={!draft.trim() || saving}
              onClick={() => void handleSave()}
            >
              {saving ? "Saving..." : "Save Client ID"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, color: "#586478", lineHeight: 1.6 }}>
            Connect your Spotify account to control playback without leaving
            Axon.
          </div>

          {error && (
            <div
              className="rounded px-3 py-2"
              style={{
                fontSize: 11,
                color: "#f87171",
                background: "rgba(248,113,113,0.08)",
                border: "1px solid rgba(248,113,113,0.15)",
              }}
            >
              {error}
            </div>
          )}

          <button
            className="w-full flex items-center justify-center gap-2 rounded font-semibold transition-opacity cursor-pointer hover:opacity-90 active:opacity-70"
            style={{
              height: 30,
              fontSize: 11,
              background: "#1db954",
              color: "#000",
              border: "none",
            }}
            onClick={() => void onConnect()}
          >
            Connect with Spotify
          </button>

          <button
            className="text-center cursor-pointer hover:underline"
            style={{
              fontSize: 10,
              color: "#333",
              background: "none",
              border: "none",
            }}
            onClick={() => void onSaveClientId("")}
          >
            Change client ID
          </button>

          <div
            className="text-center"
            style={{ fontSize: 10, color: "#2a2e38" }}
          >
            Opens in your browser
          </div>
        </>
      )}
    </div>
  );
}
