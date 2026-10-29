/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SPOTIFY_GREEN, SPOTIFY_INK } from "./spotifyBrand";

// The Spotify mark is the one element in this panel that should not inherit
// syntax colors. Tinting the badge with syntax.function and the glyph with
// editor.background made the icon disappear in themes where those two tokens
// were close, so the brand colors are fixed here instead of themed.
//
// The badge is the green circle, so the SVG carries only the three wave arcs.
// The full Spotify path draws the circle and cuts the waves out of it, which
// inverts the brand colors when the glyph and badge use different fills.
const BADGE_SIZE_PX = 28;

export default function SpotifyLogo() {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: BADGE_SIZE_PX,
        height: BADGE_SIZE_PX,
        background: SPOTIFY_GREEN,
      }}
    >
      <svg
        width={BADGE_SIZE_PX}
        height={BADGE_SIZE_PX}
        viewBox="0 0 24 24"
        fill={SPOTIFY_INK}
        aria-hidden="true"
      >
        <path d="M17.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02z" />
        <path d="M18.961 14.04c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2z" />
        <path d="M19.081 10.68C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
      </svg>
    </div>
  );
}
