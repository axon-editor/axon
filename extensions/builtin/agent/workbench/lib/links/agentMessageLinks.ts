/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  isDevServerUrl,
  workspacePathFromDevServerUrl,
} from "@axon-editor/shared/workspace/devServerPath";
import { resolveProposalPath } from "../conversation/agentProposalPaths";

const FILE_URL_PATTERN = /^file:\/\//i;
const EXTERNAL_URL_PATTERN = /^(https?:|mailto:|tel:)/i;
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+\-.]*:/i;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-z]:[\\/]/i;

export type AgentMessageLink =
  | { kind: "file"; path: string }
  | { kind: "external"; href: string }
  | { kind: "anchor"; id: string };

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function splitPathSuffix(value: string) {
  const markerIndex = value.search(/[?#]/);
  return markerIndex === -1 ? value : value.slice(0, markerIndex);
}

interface ResolveFileOptions {
  allowRootRelative?: boolean;
}

// Chat links can be workspace-relative, root-relative, or absolute paths. The
// absolute attempt comes first so a real workspace path is not mistaken for a
// root-relative one. Only links known to come from chat or the dev server get
// the leading-slash retry, because a file URL outside the workspace must stay
// rejected instead of being remapped under the workspace root.
function resolveWorkspaceFile(
  pathValue: string,
  folderPath: string | null,
  options: ResolveFileOptions = {},
) {
  if (!folderPath) return null;

  const normalized = safeDecode(pathValue).replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) return null;

  const direct = resolveProposalPath(normalized, folderPath);
  if (direct) return direct;

  if (!options.allowRootRelative || !normalized.startsWith("/")) return null;
  return resolveProposalPath(normalized.replace(/^\/+/, ""), folderPath);
}

function fileUrlPath(href: string) {
  try {
    const pathname = new URL(href).pathname;
    // Windows file URLs carry the drive letter behind a leading slash, which
    // the containment helper only understands without that extra slash.
    return /^\/[a-z]:\//i.test(pathname) ? pathname.slice(1) : pathname;
  } catch {
    return href.replace(FILE_URL_PATTERN, "");
  }
}

export function resolveAgentMessageLink(
  href: string,
  folderPath: string | null,
): AgentMessageLink | null {
  const trimmed = href.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("#")) {
    return { kind: "anchor", id: trimmed.slice(1) };
  }

  if (isDevServerUrl(trimmed)) {
    const devServerPath = workspacePathFromDevServerUrl(trimmed);
    if (!devServerPath) return null;
    const path = resolveWorkspaceFile(devServerPath, folderPath, {
      allowRootRelative: true,
    });
    return path ? { kind: "file", path } : null;
  }

  if (FILE_URL_PATTERN.test(trimmed)) {
    const path = resolveWorkspaceFile(fileUrlPath(trimmed), folderPath);
    return path ? { kind: "file", path } : null;
  }

  if (EXTERNAL_URL_PATTERN.test(trimmed)) {
    return { kind: "external", href: trimmed };
  }

  if (WINDOWS_ABSOLUTE_PATH_PATTERN.test(trimmed)) {
    const path = resolveWorkspaceFile(trimmed, folderPath);
    return path ? { kind: "file", path } : null;
  }

  if (URL_SCHEME_PATTERN.test(trimmed)) return null;

  const path = resolveWorkspaceFile(splitPathSuffix(trimmed), folderPath, {
    allowRootRelative: true,
  });
  return path ? { kind: "file", path } : null;
}
