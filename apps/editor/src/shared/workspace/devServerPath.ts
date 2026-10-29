/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Vite serves the renderer from a fixed local port in development. A README or
// agent answer can link to a workspace file through that origin, which looks
// like an external URL to the markdown renderers even though the path belongs
// to the open workspace. Keeping the origins here means every caller agrees on
// which localhost links are actually workspace links.
const DEV_SERVER_ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

function decodePath(pathname: string) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

// URL normalizes dot segments before exposing pathname, so a link such as
// /%2e%2e/outside.md would otherwise look like /outside.md and stay inside the
// workspace. Read the raw path to reject traversal before that normalization.
function pathEscapesRoot(href: string) {
  const rawPath =
    /^[a-z][a-z\d+\-.]*:\/\/[^/?#]*(\/[^?#]*)?/i.exec(href.trim())?.[1] ??
    "/";
  return decodePath(rawPath)
    .replace(/\\/g, "/")
    .split("/")
    .some((segment) => segment === "..");
}

function parseDevServerUrl(href: string): URL | null {
  try {
    const url = new URL(href.trim());
    return DEV_SERVER_ORIGINS.has(url.origin) ? url : null;
  } catch {
    return null;
  }
}

export function isDevServerUrl(href: string): boolean {
  return parseDevServerUrl(href) !== null;
}

export function workspacePathFromDevServerUrl(href: string): string | null {
  const url = parseDevServerUrl(href);
  if (!url) return null;
  if (pathEscapesRoot(href)) return null;

  // Malformed percent escapes should fall through to the raw pathname instead
  // of throwing inside a click handler and killing the navigation.
  return decodePath(url.pathname);
}
