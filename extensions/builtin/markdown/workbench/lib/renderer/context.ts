/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Rendering context passed to all element renderers. Contains the
// information needed to resolve relative paths, generate links, and
// handle task toggles.

export interface RenderContext {
  // Absolute path to the markdown file being rendered.
  filePath: string;

  // Workspace folder path. Used to resolve absolute image paths.
  // Null if no workspace is open.
  folderPath: string | null;

  // Called when a task checkbox is toggled. The renderer wires this
  // up to the preview's content change handler.
  onTaskToggle?: (line: number, checked: boolean) => void;
}

// Helper to resolve relative markdown paths to absolute paths.
// Markdown images and links are relative to the file's directory.
export function resolveMarkdownPath(
  src: string,
  filePath: string,
  folderPath: string | null,
): string {
  // External URLs pass through unchanged.
  if (/^(https?:|mailto:|tel:)/i.test(src)) return src;

  // Inline references (anchors, data URIs, blob URIs) pass through.
  if (/^(#|data:|blob:)/i.test(src)) return src;

  // Determine the markdown root directory.
  const separatorIndex = Math.max(
    filePath.lastIndexOf("/"),
    filePath.lastIndexOf("\\"),
  );
  const markdownRoot = folderPath ?? (separatorIndex > 0 ? filePath.slice(0, separatorIndex) : "");

  // Resolve relative to the markdown file or workspace root.
  const absolutePath = src.startsWith("/")
    ? normalizePath(`${markdownRoot}/${src}`)
    : normalizePath(`${separatorIndex > 0 ? filePath.slice(0, separatorIndex) : ""}/${src}`);

  return absolutePath;
}

// Normalizes a path by resolving . and .. segments. Does not touch
// the filesystem, just string manipulation.
function normalizePath(path: string): string {
  const parts: string[] = [];

  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return `/${parts.join("/")}`;
}

// Checks if a path points to a video file by extension.
export function isVideoPath(src: string): boolean {
  return /\.(mp4|webm|mov|m4v|ogv)$/i.test(src);
}
