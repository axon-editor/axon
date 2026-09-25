/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import path from "path";

// Shared plumbing for the axon:// asset routes. Both the workspace ticket route
// (axon://local) and the extension package route (axon://extension) hand a
// ticket to a file resolver and stream the bytes back with the same headers, so
// an image referenced by a markdown preview and one referenced by an extension
// README load through identical security rules.

export function getAssetContentType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".otf") return "font/otf";
  if (extension === ".ttf") return "font/ttf";
  if (extension === ".woff") return "font/woff";
  if (extension === ".woff2") return "font/woff2";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if (extension === ".avif") return "image/avif";
  if (extension === ".bmp") return "image/bmp";
  if (extension === ".ico") return "image/x-icon";
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".webm") return "video/webm";
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".m4v") return "video/x-m4v";
  if (extension === ".ogv") return "video/ogg";
  return null;
}

export function allowedAssetProtocolOrigin(origin: string | null) {
  return (
    origin === null ||
    origin === "null" ||
    origin === "file://" ||
    origin === "http://127.0.0.1:5173" ||
    origin === "http://localhost:5173"
  );
}

// resolveFilePath turns a ticket token into an absolute path, or null when the
// ticket is unknown or expired. The caller owns path authorization; this
// function only refuses to serve content types that would let a renderer pull
// local HTML or JS into a privileged origin.
export async function createAssetProtocolResponse(
  request: Request,
  resolveFilePath: (token: string) => string | null,
) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.pathname.split("/").filter(Boolean)[0] ?? "";
  const filePath = resolveFilePath(token);
  if (!filePath) {
    return new Response("Asset ticket is invalid or expired.", { status: 404 });
  }
  const contentType = getAssetContentType(filePath);
  const origin = request.headers.get("Origin");
  if (!allowedAssetProtocolOrigin(origin)) {
    return new Response("Origin is not allowed.", { status: 403 });
  }
  if (!contentType) {
    // The asset routes transport images, fonts, and video. Refusing documents
    // and executable content prevents local HTML/JS or project secrets from
    // being loaded into Axon's privileged renderer origin.
    return new Response("Asset type is not allowed.", { status: 403 });
  }
  const headers = new Headers({
    "Access-Control-Allow-Origin": origin ?? "null",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cross-Origin-Resource-Policy": "same-site",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  });

  try {
    const body = await fs.readFile(filePath);
    return new Response(body, { status: 200, headers });
  } catch (err) {
    return new Response(
      err instanceof Error ? err.message : "Asset was not found.",
      {
        status: 404,
        headers,
      },
    );
  }
}
