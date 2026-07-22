import { createHash } from "crypto";
import fs from "fs/promises";
import { app, type BrowserWindow } from "electron";
import type { ManagedLanguageToolProgress } from "../../shared/languageTools";
import {
  findManagedLanguageToolAssetName,
  getManagedLanguageToolPlatformKey,
  type ManagedLanguageToolCatalogEntry,
} from "./catalog";

const MAX_TOOL_ARCHIVE_BYTES = 512 * 1024 * 1024;

interface GitHubReleaseAsset {
  name?: string;
  size?: number;
  digest?: string;
  browser_download_url?: string;
}

interface GitHubReleasePayload {
  tag_name?: string;
  assets?: GitHubReleaseAsset[];
}

interface OpenVsxVersionPayload {
  name?: string;
  namespace?: string;
  targetPlatform?: string;
  version?: string;
  verified?: boolean;
  files?: {
    download?: string;
    sha256?: string;
  };
}

interface DotNetReleasePayload {
  releases?: Array<{
    sdk?: {
      version?: string;
      files?: Array<{
        name?: string;
        rid?: string;
        url?: string;
        hash?: string;
      }>;
    };
  }>;
}

export interface ResolvedToolAsset {
  version: string;
  name: string;
  size: number;
  hashAlgorithm: "sha256" | "sha512";
  checksum: string;
  downloadUrl: string;
}

function isAllowedDownloadUrl(repository: string, candidate: string) {
  try {
    const url = new URL(candidate);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.pathname.startsWith(`/${repository}/releases/download/`)
    );
  } catch {
    return false;
  }
}

function isAllowedOpenVsxUrl(candidate: string, expectedPathPrefix: string) {
  try {
    const url = new URL(candidate);
    return (
      url.protocol === "https:" &&
      url.hostname === "open-vsx.org" &&
      url.pathname.startsWith(expectedPathPrefix)
    );
  } catch {
    return false;
  }
}

function isAllowedOpenVsxDownloadResponse(candidate: string) {
  try {
    const url = new URL(candidate);
    return (
      url.protocol === "https:" &&
      (url.hostname === "open-vsx.org" ||
        url.hostname === "openvsx.eclipsecontent.org")
    );
  } catch {
    return false;
  }
}

function isAllowedDotNetDownloadUrl(candidate: string, version: string) {
  try {
    const url = new URL(candidate);
    return (
      url.protocol === "https:" &&
      url.hostname === "builds.dotnet.microsoft.com" &&
      url.pathname.startsWith(`/dotnet/Sdk/${version}/`)
    );
  } catch {
    return false;
  }
}

function isAllowedPinnedHttpsUrl(candidate: string) {
  try {
    const url = new URL(candidate);
    return (
      url.protocol === "https:" &&
      [
        "releases.hashicorp.com",
        "storage.googleapis.com",
        "download.swift.org",
      ].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export class ManagedLanguageToolAssetService {
  constructor(
    private readonly publish: (
      targetWindow: BrowserWindow | null,
      progress: ManagedLanguageToolProgress,
    ) => void,
  ) {}

  async resolveAsset(
    entry: ManagedLanguageToolCatalogEntry,
    signal: AbortSignal,
  ) {
    const platformKey = getManagedLanguageToolPlatformKey();
    if (entry.dotnetSdk) {
      const rid = entry.dotnetSdk.ridByPlatform[platformKey];
      if (!rid) {
        throw new Error(`${entry.label} is not available for this platform.`);
      }
      const response = await fetch(
        `https://builds.dotnet.microsoft.com/dotnet/release-metadata/${entry.dotnetSdk.channel}/releases.json`,
        {
          signal,
          headers: {
            Accept: "application/json",
            "User-Agent": `Axon/${app.getVersion()}`,
          },
        },
      );
      if (!response.ok) {
        throw new Error(
          `Microsoft returned ${response.status} while resolving .NET.`,
        );
      }
      const metadata = (await response.json()) as DotNetReleasePayload;
      const sdk = metadata.releases?.find(
        (release) => release.sdk?.version === entry.dotnetSdk?.version,
      )?.sdk;
      const file = sdk?.files?.find(
        (candidate) =>
          candidate.rid === rid &&
          (candidate.name?.endsWith(".tar.gz") ||
            candidate.name?.endsWith(".zip")),
      );
      if (
        !file?.name ||
        !file.url ||
        !file.hash ||
        !/^[a-f0-9]{128}$/i.test(file.hash) ||
        !isAllowedDotNetDownloadUrl(file.url, entry.dotnetSdk.version)
      ) {
        throw new Error(
          "Microsoft did not provide the pinned .NET SDK archive.",
        );
      }
      const downloadMetadata = await fetch(file.url, {
        method: "HEAD",
        signal,
        headers: { "User-Agent": `Axon/${app.getVersion()}` },
      });
      const size = Number(downloadMetadata.headers.get("content-length"));
      if (
        !downloadMetadata.ok ||
        !isAllowedDotNetDownloadUrl(
          downloadMetadata.url,
          entry.dotnetSdk.version,
        ) ||
        !Number.isSafeInteger(size) ||
        size <= 0 ||
        size > MAX_TOOL_ARCHIVE_BYTES
      ) {
        throw new Error(
          "Microsoft did not provide verifiable .NET package metadata.",
        );
      }
      return {
        version: entry.dotnetSdk.version,
        name: file.name,
        size,
        hashAlgorithm: "sha512",
        checksum: file.hash.toLowerCase(),
        downloadUrl: file.url,
      } satisfies ResolvedToolAsset;
    }

    if (entry.openVsx) {
      const targetPlatform = entry.openVsx.platforms.includes(platformKey)
        ? platformKey
        : entry.openVsx.platforms.includes("universal")
          ? "universal"
          : null;
      if (!targetPlatform) {
        throw new Error(`${entry.label} is not available for this platform.`);
      }
      const { namespace, extension, version } = entry.openVsx;
      const metadataPath =
        targetPlatform === "universal"
          ? `/api/${namespace}/${extension}/${version}`
          : `/api/${namespace}/${extension}/${targetPlatform}/${version}`;
      const response = await fetch(`https://open-vsx.org${metadataPath}`, {
        signal,
        headers: {
          Accept: "application/json",
          "User-Agent": `Axon/${app.getVersion()}`,
        },
      });
      if (!response.ok) {
        throw new Error(
          `Open VSX returned ${response.status} while resolving tools.`,
        );
      }
      const metadata = (await response.json()) as OpenVsxVersionPayload;
      const expectedFilePrefix = `${metadataPath}/file/`;
      if (
        metadata.namespace !== namespace ||
        metadata.name !== extension ||
        metadata.version !== version ||
        metadata.targetPlatform !== targetPlatform ||
        metadata.verified !== true ||
        !metadata.files?.download ||
        !metadata.files.sha256 ||
        !isAllowedOpenVsxUrl(metadata.files.download, expectedFilePrefix) ||
        !isAllowedOpenVsxUrl(metadata.files.sha256, expectedFilePrefix)
      ) {
        throw new Error(
          "Open VSX did not provide a verified platform package.",
        );
      }

      const [checksumResponse, downloadMetadata] = await Promise.all([
        fetch(metadata.files.sha256, {
          signal,
          headers: { "User-Agent": `Axon/${app.getVersion()}` },
        }),
        fetch(metadata.files.download, {
          method: "HEAD",
          signal,
          headers: { "User-Agent": `Axon/${app.getVersion()}` },
        }),
      ]);
      const checksum = (await checksumResponse.text()).trim();
      const size = Number(downloadMetadata.headers.get("content-length"));
      if (
        !checksumResponse.ok ||
        !downloadMetadata.ok ||
        !/^[a-f0-9]{64}$/i.test(checksum) ||
        !isAllowedOpenVsxDownloadResponse(downloadMetadata.url) ||
        !Number.isSafeInteger(size) ||
        size <= 0 ||
        size > MAX_TOOL_ARCHIVE_BYTES
      ) {
        throw new Error(
          "Open VSX did not provide verifiable package metadata.",
        );
      }
      return {
        version,
        name: `${namespace}.${extension}-${version}@${targetPlatform}.vsix`,
        size,
        hashAlgorithm: "sha256",
        checksum: checksum.toLowerCase(),
        downloadUrl: metadata.files.download,
      } satisfies ResolvedToolAsset;
    }

    if (entry.pinnedGithubAsset) {
      if (
        !entry.repository ||
        !entry.pinnedGithubAsset.platforms.includes(platformKey)
      ) {
        throw new Error(`${entry.label} is not available for this platform.`);
      }
      const asset = entry.pinnedGithubAsset;
      const downloadUrl = `https://github.com/${entry.repository}/releases/download/${asset.tag}/${asset.name}`;
      if (!isAllowedDownloadUrl(entry.repository, downloadUrl)) {
        throw new Error(`${entry.label} has an invalid pinned download URL.`);
      }
      return {
        version: asset.tag,
        name: asset.name,
        size: asset.size,
        hashAlgorithm: "sha256",
        checksum: asset.sha256,
        downloadUrl,
      } satisfies ResolvedToolAsset;
    }

    const pinnedPlatformAsset = entry.pinnedGithubAssets?.[platformKey];
    if (pinnedPlatformAsset) {
      if (!entry.repository) {
        throw new Error(
          `${entry.label} does not have a configured download source.`,
        );
      }
      const downloadUrl = `https://github.com/${entry.repository}/releases/download/${pinnedPlatformAsset.tag}/${pinnedPlatformAsset.name}`;
      if (!isAllowedDownloadUrl(entry.repository, downloadUrl)) {
        throw new Error(`${entry.label} has an invalid pinned download URL.`);
      }
      return {
        version: pinnedPlatformAsset.tag,
        name: pinnedPlatformAsset.name,
        size: pinnedPlatformAsset.size,
        hashAlgorithm: "sha256",
        checksum: pinnedPlatformAsset.sha256,
        downloadUrl,
      } satisfies ResolvedToolAsset;
    }

    const pinnedHttpsAsset = entry.pinnedHttpsAssets?.[platformKey];
    if (pinnedHttpsAsset) {
      if (!isAllowedPinnedHttpsUrl(pinnedHttpsAsset.url)) {
        throw new Error(`${entry.label} has an invalid pinned download URL.`);
      }
      return {
        version: pinnedHttpsAsset.version,
        name: pinnedHttpsAsset.name,
        size: pinnedHttpsAsset.size,
        hashAlgorithm: "sha256",
        checksum: pinnedHttpsAsset.sha256,
        downloadUrl: pinnedHttpsAsset.url,
      } satisfies ResolvedToolAsset;
    }

    if (!entry.assetNames[platformKey] && !entry.assetPatterns?.[platformKey]) {
      throw new Error(`${entry.label} is not available for this platform.`);
    }

    if (!entry.repository) {
      throw new Error(
        `${entry.label} does not have a configured download source.`,
      );
    }
    if (!entry.githubTag || !entry.expectedSha256ByPlatform?.[platformKey]) {
      throw new Error(
        `${entry.label} does not have a pinned release checksum.`,
      );
    }
    const response = await fetch(
      `https://api.github.com/repos/${entry.repository}/releases/tags/${encodeURIComponent(entry.githubTag)}`,
      {
        signal,
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": `Axon/${app.getVersion()}`,
        },
      },
    );
    if (!response.ok) {
      throw new Error(
        `GitHub returned ${response.status} while resolving tools.`,
      );
    }
    const release = (await response.json()) as GitHubReleasePayload;
    const assetName = findManagedLanguageToolAssetName(
      entry,
      (release.assets ?? []).flatMap((candidate) =>
        candidate.name ? [candidate.name] : [],
      ),
    );
    const asset = release.assets?.find(
      (candidate) => candidate.name === assetName,
    );
    const digest = asset?.digest?.match(/^sha256:([a-f0-9]{64})$/i)?.[1];
    if (
      !release.tag_name ||
      release.tag_name !== entry.githubTag ||
      !asset?.name ||
      !asset.browser_download_url ||
      !digest ||
      !isAllowedDownloadUrl(entry.repository, asset.browser_download_url)
    ) {
      throw new Error(
        "The upstream release did not provide a verifiable tool asset.",
      );
    }
    if (digest.toLowerCase() !== entry.expectedSha256ByPlatform[platformKey]) {
      throw new Error(
        "The upstream release checksum does not match Axon's catalog.",
      );
    }
    const size = asset.size ?? 0;
    if (size <= 0 || size > MAX_TOOL_ARCHIVE_BYTES) {
      throw new Error("The language tool archive has an invalid size.");
    }
    return {
      version: release.tag_name,
      name: asset.name,
      size,
      hashAlgorithm: "sha256",
      checksum: digest.toLowerCase(),
      downloadUrl: asset.browser_download_url,
    } satisfies ResolvedToolAsset;
  }

  async downloadAsset(
    entry: ManagedLanguageToolCatalogEntry,
    asset: ResolvedToolAsset,
    destination: string,
    targetWindow: BrowserWindow | null,
    signal: AbortSignal,
  ) {
    const response = await fetch(asset.downloadUrl, {
      signal,
      headers: { "User-Agent": `Axon/${app.getVersion()}` },
    });
    if (!response.ok || !response.body) {
      throw new Error(`Tool download failed with HTTP ${response.status}.`);
    }
    if (
      asset.downloadUrl.startsWith("https://open-vsx.org/") &&
      !isAllowedOpenVsxDownloadResponse(response.url)
    ) {
      throw new Error(
        "The language tool download redirected to an untrusted host.",
      );
    }
    if (
      isAllowedPinnedHttpsUrl(asset.downloadUrl) &&
      !isAllowedPinnedHttpsUrl(response.url)
    ) {
      throw new Error(
        "The language tool download redirected to an untrusted host.",
      );
    }

    const file = await fs.open(destination, "w", 0o600);
    const reader = response.body.getReader();
    const hash = createHash(asset.hashAlgorithm);
    let transferred = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        transferred += value.byteLength;
        if (transferred > asset.size || transferred > MAX_TOOL_ARCHIVE_BYTES) {
          throw new Error(
            "The language tool download exceeded its declared size.",
          );
        }
        hash.update(value);
        await file.write(value);
        this.publish(targetWindow, {
          id: entry.id,
          phase: "downloading",
          transferred,
          total: asset.size,
          percent: Math.min(100, (transferred / asset.size) * 100),
        });
      }
    } finally {
      await file.close();
    }

    if (transferred !== asset.size || hash.digest("hex") !== asset.checksum) {
      throw new Error(
        "The downloaded language tool failed checksum verification.",
      );
    }
  }
}
