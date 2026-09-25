/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app } from "electron";
import {
  isExtensionKind,
  isRecord,
  type ExtensionMarketplaceItem,
  type ExtensionRegistryIndex,
  type ExtensionRegistryIndexEntry,
} from "@axon/extension-api";

// The hosted registry index is fetched from the extensions repository. The
// default points at the axon-editor/extensions repo whose build tool generates
// registry.json next to the packaged .zip files; local development and forks
// can redirect the index with AXON_EXTENSION_REGISTRY_URL.
const DEFAULT_REMOTE_EXTENSION_REGISTRY_URL =
  "https://raw.githubusercontent.com/axon-editor/extensions/main/registry.json";

const REMOTE_EXTENSION_REGISTRY_TTL_MS = 15 * 60 * 1000;
const REMOTE_EXTENSION_REGISTRY_MAX_BYTES = 5 * 1024 * 1024;
const REMOTE_EXTENSION_README_MAX_BYTES = 256 * 1024;
export const REMOTE_EXTENSION_PACKAGE_MAX_BYTES = 50 * 1024 * 1024;
const REMOTE_EXTENSION_FETCH_TIMEOUT_MS = 10_000;

const DEFAULT_REMOTE_EXTENSION_HOSTS = new Set([
  "github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
]);

function getConfiguredRegistryUrl() {
  return process.env.AXON_EXTENSION_REGISTRY_URL?.trim() ||
    DEFAULT_REMOTE_EXTENSION_REGISTRY_URL;
}

function getAdditionalAllowedHosts() {
  return (process.env.AXON_EXTENSION_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
}

// Both the registry index and every downloadable package must stay on an
// https host we control or trust to serve extension content. The final
// response URL is checked again after redirects so a compromised index cannot
// point package downloads at an arbitrary host.
export function isAllowedRemoteHost(candidate: string) {
  try {
    const url = new URL(candidate);
    return (
      url.protocol === "https:" &&
      (DEFAULT_REMOTE_EXTENSION_HOSTS.has(url.hostname) ||
        getAdditionalAllowedHosts().includes(url.hostname))
    );
  } catch {
    return false;
  }
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function normalizeRegistryEntry(
  value: unknown,
): ExtensionRegistryIndexEntry | null {
  if (!isRecord(value)) return null;

  const id = normalizeString(value.id);
  const name = normalizeString(value.name) || id;
  const publisher = normalizeString(value.publisher) || "community";
  const version = normalizeString(value.version);
  const kind = isExtensionKind(value.kind) ? value.kind : "mixed";
  const sourceValue = normalizeString(value.source);
  const source =
    sourceValue === "builtin" ||
    sourceValue === "marketplace" ||
    sourceValue === "user" ||
    sourceValue === "workspace"
      ? sourceValue
      : "marketplace";
  const installModeValue = normalizeString(value.installMode);
  const installMode =
    installModeValue === "download"
      ? "download"
      : installModeValue === "copy"
        ? "copy"
        : null;

  if (!id || !version || !installMode) return null;

  const packageUrl = normalizeString(value.packageUrl);
  const sha256 = normalizeString(value.sha256).toLowerCase();

  // A download entry must name a verifiable https package. Copy entries are
  // only meaningful for local folders and cannot be fetched remotely, so they
  // are accepted here without a package URL to stay schema compatible.
  if (installMode === "download") {
    if (
      !packageUrl ||
      !isAllowedRemoteHost(packageUrl) ||
      !/^[a-f0-9]{64}$/.test(sha256)
    ) {
      return null;
    }
  }

  const size = Number(value.size);
  const description = normalizeString(value.description);
  const icon = normalizeString(value.icon);
  const readmeText = normalizeString(value.readme);

  return {
    id,
    name,
    publisher,
    version,
    description: description || undefined,
    kind,
    source,
    repositoryUrl: normalizeString(value.repositoryUrl) || undefined,
    homepageUrl: normalizeString(value.homepageUrl) || undefined,
    packageUrl: packageUrl || undefined,
    installMode,
    categories: normalizeStringArray(value.categories),
    tags: normalizeStringArray(value.tags),
    icon: icon || undefined,
    sha256: installMode === "download" ? sha256 : undefined,
    size: Number.isSafeInteger(size) && size > 0 ? size : undefined,
    // A registry is remote input, so the README is size-capped before it can
    // reach the renderer. The cap mirrors the installed-package README cap in
    // the extension host so both paths render identically.
    readme:
      readmeText &&
      Buffer.byteLength(readmeText, "utf-8") <= REMOTE_EXTENSION_README_MAX_BYTES
        ? readmeText
        : undefined,
  };
}

function parseRegistryIndex(text: string): ExtensionRegistryIndex {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The extension registry index is not valid JSON.");
  }

  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.extensions)) {
    throw new Error("The extension registry index is not a supported registry.json.");
  }

  const extensions = parsed.extensions
    .map(normalizeRegistryEntry)
    .filter((entry): entry is ExtensionRegistryIndexEntry => entry !== null);

  return {
    version: 1,
    generatedAt: normalizeString(parsed.generatedAt) || undefined,
    extensions,
  };
}

async function fetchRegistryText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_EXTENSION_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": `Axon/${app.getVersion()}`,
      },
    });
    if (!response.ok) {
      throw new Error(`The extension registry returned HTTP ${response.status}.`);
    }
    if (!isAllowedRemoteHost(response.url)) {
      throw new Error("The extension registry redirected to an untrusted host.");
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (
      Number.isSafeInteger(contentLength) &&
      contentLength > REMOTE_EXTENSION_REGISTRY_MAX_BYTES
    ) {
      throw new Error("The extension registry index is too large.");
    }

    const text = await response.text();
    if (Buffer.byteLength(text, "utf-8") > REMOTE_EXTENSION_REGISTRY_MAX_BYTES) {
      throw new Error("The extension registry index is too large.");
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

const DEFAULT_REGISTRY_OPTIONS = { forceRefresh: false } as const;

interface CachedRegistryIndex extends ExtensionRegistryIndex {
  fetchedAt: number;
}

export function resetRemoteRegistryCacheForTests() {
  remoteRegistryCache = null;
}

let remoteRegistryCache: CachedRegistryIndex | null = null;

export async function fetchRemoteRegistry(
  options: { forceRefresh?: boolean } = DEFAULT_REGISTRY_OPTIONS,
): Promise<ExtensionRegistryIndex> {
  const url = getConfiguredRegistryUrl();
  if (!isAllowedRemoteHost(url)) {
    throw new Error("The extension registry URL is not an allowed https host.");
  }

  const cacheIsValid =
    remoteRegistryCache !== null &&
    Date.now() - remoteRegistryCache.fetchedAt < REMOTE_EXTENSION_REGISTRY_TTL_MS;
  if (!options.forceRefresh && cacheIsValid && remoteRegistryCache) {
    return remoteRegistryCache;
  }

  const index = parseRegistryIndex(await fetchRegistryText(url));
  remoteRegistryCache = { ...index, fetchedAt: Date.now() };
  return index;
}

// Downloads surface remote packages alongside the bundled marketplace. The
// registry entry already carries display metadata, so the item is a projection
// of the index entry rather than a normalized manifest. Categories double as
// contribution chips because a packaged game or tool has no resolved manifest
// contributions to count yet.
export function toRemoteMarketplaceItems(
  index: ExtensionRegistryIndex,
  installedIds: Set<string>,
): ExtensionMarketplaceItem[] {
  return index.extensions.map((entry) => ({
    id: entry.id,
    name: entry.name,
    publisher: entry.publisher,
    version: entry.version,
    description: entry.description ?? "",
    repositoryUrl: entry.repositoryUrl ?? null,
    homepageUrl: entry.homepageUrl ?? null,
    categories: entry.categories ?? [],
    kind: entry.kind,
    themes: [],
    contributionLabels: entry.categories ?? [],
    installed: installedIds.has(entry.id),
    readme: entry.readme ?? null,
    source: "remote",
  }));
}

// Install resolves a remote package the same way the marketplace resolves a
// bundled folder: by id. A cache miss re-fetches the index once so a package
// published moments ago can install immediately without a manual refresh.
export async function getRemoteRegistryEntry(
  extensionId: string,
): Promise<ExtensionRegistryIndexEntry | null> {
  const index = await fetchRemoteRegistry({ forceRefresh: true }).catch(() => null);
  return index?.extensions.find((entry) => entry.id === extensionId) ?? null;
}