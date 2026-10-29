/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// First-run screen inside the sidebar Spotify view.
// Axon owns the Spotify OAuth application, so the only action here is the
// connect handoff. Release builds compile in Axon's client ID; local builds
// without one surface the main-process error instead of hiding the button.
// The action uses fixed brand colors because glass themes make the usual
// syntax and editor tokens collapse into the surface behind them.
import { SPOTIFY_GREEN, SPOTIFY_INK } from "../brand/spotifyBrand";
import SpotifyLogo from "../brand/SpotifyLogo";

interface Props {
  onConnect: () => Promise<void>;
  error: string | null;
}

export default function SpotifyAuth({ onConnect, error }: Props) {
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div className="flex items-center gap-2.5">
        <SpotifyLogo />
        <div>
          <div className="text-[12px] font-semibold text-[var(--axon-editor-foreground)]">
            Spotify
          </div>
          <div className="text-[10px] text-[var(--axon-editor-foreground)] opacity-40">
            Requires Premium
          </div>
        </div>
      </div>

      <div className="text-[11px] leading-[1.6] text-[var(--axon-editor-foreground)] opacity-55">
        Connect your Spotify account to control playback without leaving Axon.
      </div>

      {error && (
        <div className="rounded border border-[var(--axon-danger-foreground)] bg-[var(--axon-danger-background)] px-3 py-2 text-[11px] text-[var(--axon-danger-foreground)]">
          {error}
        </div>
      )}

      <button
        className="flex h-[30px] w-full cursor-pointer items-center justify-center gap-2 rounded text-[11px] font-semibold transition-opacity hover:opacity-90 active:opacity-70"
        style={{
          border: "none",
          background: SPOTIFY_GREEN,
          color: SPOTIFY_INK,
        }}
        onClick={() => void onConnect()}
      >
        Connect with Spotify
      </button>

      <div className="text-center text-[10px] text-[var(--axon-editor-foreground)] opacity-35">
        Opens in your browser
      </div>
    </div>
  );
}
