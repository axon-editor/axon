/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InlineToken } from "../types";

// Media renderer. Handles images, video, and audio elements. Resolves
// relative paths to workspace assets using the render context.

// Renders an image token. Uses the context to resolve relative paths
// to workspace assets. External URLs pass through unchanged.
export function renderImage(
  token: InlineToken,
  resolveAsset: (src: string) => string,
): string {
  if (token.type !== "image") return "";

  const resolvedSrc = resolveAsset(token.src);
  if (!resolvedSrc) return "";

  return `<img src="${escapeAttr(resolvedSrc)}" alt="${escapeAttr(token.alt)}" ${token.title ? `title="${escapeAttr(token.title)}"` : ""} class="my-4 inline-block align-middle" />`;
}

// Renders a video element. Videos get a border and background to
// distinguish them from images.
export function renderVideo(
  src: string,
  resolveAsset: (src: string) => string,
): string {
  const resolvedSrc = resolveAsset(src);
  if (!resolvedSrc) return "";

  return `<video src="${escapeAttr(resolvedSrc)}" controls class="my-4 inline-block rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] align-middle" style="max-width: 100%" />`;
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
