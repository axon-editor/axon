import { createHash } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import { Transform } from "stream";
import { createGunzip } from "zlib";
import { app, type BrowserWindow } from "electron";
import extractZip from "extract-zip";
import { extract as extractTar, list as listTar } from "tar";
import { open as openZip, type Entry as ZipEntry } from "yauzl";
import type {
  ManagedLanguageToolId,
  ManagedLanguageToolInstallResult,
  ManagedLanguageToolProgress,
  ManagedLanguageToolStatus,
} from "../../shared/languageTools";
import {
  MANAGED_LANGUAGE_TOOL_CATALOG,
  getManagedLanguageToolCatalogEntry,
  getManagedLanguageToolForLanguage,
  getManagedLanguageToolPlatformKey,
  findManagedLanguageToolAssetName,
  type ManagedLanguageToolCatalogEntry,
} from "./catalog";

const MAX_TOOL_ARCHIVE_BYTES = 300 * 1024 * 1024;
const MAX_TOOL_EXTRACTED_BYTES = 2 * 1024 * 1024 * 1024;

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

interface ResolvedToolAsset {
  version: string;
  name: string;
  size: number;
  hashAlgorithm: "sha256" | "sha512";
  checksum: string;
  downloadUrl: string;
}

interface ManagedLanguageToolManagerDependencies {
  sendToRenderer: (
    channel: string,
    payload: unknown,
    targetWindow?: BrowserWindow | null,
  ) => void;
}

export function isSafeArchiveEntry(entry: string) {
  const normalized = entry.replace(/\\/g, "/").trim();
  if (!normalized || normalized.includes("\0")) return false;
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    return false;
  }
  return !normalized.split("/").some((part: string) => part === "..");
}

function isZipSymbolicLink(entry: ZipEntry) {
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (mode & 0o170000) === 0o120000;
}

async function validateZipArchive(archivePath: string) {
  await new Promise<void>((resolve, reject) => {
    openZip(archivePath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error("The ZIP archive could not be opened."));
        return;
      }

      let entryCount = 0;
      let extractedBytes = 0;
      const fail = (error: Error) => {
        zipFile.close();
        reject(error);
      };

      zipFile.on("error", reject);
      zipFile.on("entry", (entry) => {
        entryCount += 1;
        extractedBytes += entry.uncompressedSize;
        if (!isSafeArchiveEntry(entry.fileName)) {
          fail(new Error("The language tool ZIP contains an unsafe path."));
          return;
        }
        if (isZipSymbolicLink(entry)) {
          fail(new Error("The language tool ZIP contains a symbolic link."));
          return;
        }
        if (extractedBytes > MAX_TOOL_EXTRACTED_BYTES) {
          fail(new Error("The language tool ZIP expands beyond the allowed size."));
          return;
        }
        zipFile.readEntry();
      });
      zipFile.on("end", () => {
        if (entryCount === 0) {
          fail(new Error("The language tool ZIP is empty."));
          return;
        }
        resolve();
      });
      zipFile.readEntry();
    });
  });
}

async function extractZipArchive(archivePath: string, destination: string) {
  await validateZipArchive(archivePath);
  await extractZip(archivePath, {
    dir: destination,
    onEntry: (entry) => {
      if (!isSafeArchiveEntry(entry.fileName) || isZipSymbolicLink(entry)) {
        throw new Error("The language tool ZIP changed after validation.");
      }
    },
  });
}

async function extractTarArchive(archivePath: string, destination: string) {
  let entryCount = 0;
  let extractedBytes = 0;

  // Listing the archive first prevents extraction from creating any files
  // until every path and entry type has passed the same policy. The extraction
  // filter repeats that policy so a future change cannot accidentally make the
  // validation and write phases disagree.
  await listTar({
    file: archivePath,
    strict: true,
    onReadEntry: (entry) => {
      if (entry.meta) return;
      entryCount += 1;
      extractedBytes += entry.size;
      if (!isSafeArchiveEntry(entry.path)) {
        throw new Error("The language tool TAR contains an unsafe path.");
      }
      if (!["File", "OldFile", "Directory"].includes(entry.type)) {
        throw new Error(`The language tool TAR contains ${entry.type}.`);
      }
      if (extractedBytes > MAX_TOOL_EXTRACTED_BYTES) {
        throw new Error("The language tool TAR expands beyond the allowed size.");
      }
    },
  });
  if (entryCount === 0) throw new Error("The language tool TAR is empty.");

  await extractTar({
    file: archivePath,
    cwd: destination,
    strict: true,
    preservePaths: false,
    unlink: true,
    filter: (entryPath, entry) =>
      isSafeArchiveEntry(entryPath) &&
      ("type" in entry
        ? ["File", "OldFile", "Directory"].includes(entry.type)
        : false),
  });
}

async function extractGzipExecutable(
  archivePath: string,
  assetName: string,
  destination: string,
) {
  const outputName = path.basename(assetName, ".gz");
  if (!isSafeArchiveEntry(outputName)) {
    throw new Error("The compressed language tool has an unsafe name.");
  }

  let extractedBytes = 0;
  const sizeGuard = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      extractedBytes += chunk.length;
      if (extractedBytes > MAX_TOOL_EXTRACTED_BYTES) {
        callback(new Error("The language tool expands beyond the allowed size."));
        return;
      }
      callback(null, chunk);
    },
  });
  await pipeline(
    createReadStream(archivePath),
    createGunzip(),
    sizeGuard,
    createWriteStream(path.join(destination, outputName), { mode: 0o600 }),
  );
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

async function findExecutable(
  directory: string,
  executableNames: string[],
): Promise<string | null> {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error("The downloaded language tool contains a symbolic link.");
    }
    if (entry.isDirectory()) {
      const nested = await findExecutable(entryPath, executableNames);
      if (nested) return nested;
    } else if (entry.isFile() && executableNames.includes(entry.name)) {
      return entryPath;
    }
  }
  return null;
}

export class ManagedLanguageToolManager {
  private readonly installations = new Map<
    ManagedLanguageToolId,
    {
      promise: Promise<ManagedLanguageToolInstallResult>;
      controller: AbortController;
      dependencyId?: ManagedLanguageToolId;
    }
  >();

  constructor(private readonly deps: ManagedLanguageToolManagerDependencies) {}

  private getRoot() {
    return path.join(app.getPath("userData"), "language-tools");
  }

  private getToolRoot(id: ManagedLanguageToolId) {
    return path.join(this.getRoot(), getManagedLanguageToolPlatformKey(), id);
  }

  private getExecutablePath(entry: ManagedLanguageToolCatalogEntry) {
    return path.join(
      this.getToolRoot(entry.id),
      "bin",
      process.platform === "win32"
        ? entry.windowsCommandName
        : entry.commandName,
    );
  }

  private getCatalogVersion(entry: ManagedLanguageToolCatalogEntry) {
    return (
      entry.githubTag ??
      entry.openVsx?.version ??
      entry.pinnedGithubAsset?.tag ??
      entry.dotnetSdk?.version
    );
  }

  private async getInstalledDependents(id: ManagedLanguageToolId) {
    const dependentEntries = MANAGED_LANGUAGE_TOOL_CATALOG.filter((entry) =>
      entry.dependencies?.includes(id),
    );
    const installedLabels = await Promise.all(
      dependentEntries.map(async (entry) => {
        const installed = await fs
          .access(this.getExecutablePath(entry))
          .then(() => true)
          .catch(() => false);
        return installed ? entry.label : null;
      }),
    );
    return installedLabels.filter((label): label is string => Boolean(label));
  }

  async getStatus(id: ManagedLanguageToolId): Promise<ManagedLanguageToolStatus> {
    const entry = getManagedLanguageToolCatalogEntry(id);
    if (!entry) throw new Error(`Unknown managed language tool: ${id}`);
    const platformKey = getManagedLanguageToolPlatformKey();
    const assetName =
      entry.assetNames[platformKey] ??
      entry.assetPatterns?.[platformKey] ??
      entry.openVsx?.platforms.includes(platformKey) ??
      entry.pinnedGithubAsset?.platforms.includes(platformKey) ??
      Boolean(entry.dotnetSdk?.ridByPlatform[platformKey]);
    const executableInstalled = await fs
      .access(this.getExecutablePath(entry))
      .then(() => true)
      .catch(() => false);
    const dependencyStates = await Promise.all(
      (entry.dependencies ?? []).map(async (dependencyId) => {
        const dependencyEntry = getManagedLanguageToolCatalogEntry(dependencyId);
        if (!dependencyEntry) return { label: dependencyId, installed: false };
        const dependencyInstalled = await fs
          .access(this.getExecutablePath(dependencyEntry))
          .then(() => true)
          .catch(() => false);
        return { label: dependencyEntry.label, installed: dependencyInstalled };
      }),
    );
    const missingDependencies = dependencyStates
      .filter((dependency) => !dependency.installed)
      .map((dependency) => dependency.label);
    const installed = executableInstalled && missingDependencies.length === 0;
    const metadata: { version?: string } = await fs
      .readFile(path.join(this.getToolRoot(id), "install.json"), "utf8")
      .then((value) => JSON.parse(value) as { version?: string })
      .catch(() => ({} as { version?: string }));
    const catalogVersion = this.getCatalogVersion(entry);
    const requiredBy = await this.getInstalledDependents(id);

    return {
      id,
      label: entry.label,
      languages: entry.languages,
      installed,
      supported: Boolean(assetName),
      version: metadata.version,
      catalogVersion,
      updateAvailable: Boolean(
        installed && catalogVersion && metadata.version !== catalogVersion,
      ),
      requiredBy,
      missingDependencies,
      detail: executableInstalled && missingDependencies.length > 0
        ? `${entry.label} needs repair because ${missingDependencies.join(", ")} is missing.`
        : installed
        ? `${entry.label} language tools are installed.`
        : assetName
          ? `${entry.label} language tools can be installed by Axon.`
          : `${entry.label} language tools are not published for this platform.`,
    };
  }

  async getRecommendation(languageId: string) {
    const status = await this.getStatusForLanguage(languageId);
    if (!status) return null;
    return status.installed ? null : status;
  }

  async getStatusForLanguage(languageId: string) {
    const entry = getManagedLanguageToolForLanguage(languageId);
    return entry ? this.getStatus(entry.id) : null;
  }

  async listStatuses() {
    return Promise.all(
      MANAGED_LANGUAGE_TOOL_CATALOG.filter((entry) => !entry.hidden).map(
        (entry) => this.getStatus(entry.id),
      ),
    );
  }

  private publish(
    targetWindow: BrowserWindow | null,
    progress: ManagedLanguageToolProgress,
  ) {
    this.deps.sendToRenderer(
      "languageTools:progress",
      progress,
      targetWindow,
    );
  }

  private async resolveAsset(
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
        { signal, headers: { Accept: "application/json", "User-Agent": `Axon/${app.getVersion()}` } },
      );
      if (!response.ok) {
        throw new Error(`Microsoft returned ${response.status} while resolving .NET.`);
      }
      const metadata = (await response.json()) as DotNetReleasePayload;
      const sdk = metadata.releases?.find(
        (release) => release.sdk?.version === entry.dotnetSdk?.version,
      )?.sdk;
      const file = sdk?.files?.find(
        (candidate) =>
          candidate.rid === rid &&
          (candidate.name?.endsWith(".tar.gz") || candidate.name?.endsWith(".zip")),
      );
      if (
        !file?.name ||
        !file.url ||
        !file.hash ||
        !/^[a-f0-9]{128}$/i.test(file.hash) ||
        !isAllowedDotNetDownloadUrl(file.url, entry.dotnetSdk.version)
      ) {
        throw new Error("Microsoft did not provide the pinned .NET SDK archive.");
      }
      const downloadMetadata = await fetch(file.url, {
        method: "HEAD",
        signal,
        headers: { "User-Agent": `Axon/${app.getVersion()}` },
      });
      const size = Number(downloadMetadata.headers.get("content-length"));
      if (
        !downloadMetadata.ok ||
        !isAllowedDotNetDownloadUrl(downloadMetadata.url, entry.dotnetSdk.version) ||
        !Number.isSafeInteger(size) ||
        size <= 0 ||
        size > MAX_TOOL_ARCHIVE_BYTES
      ) {
        throw new Error("Microsoft did not provide verifiable .NET package metadata.");
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
      if (!entry.openVsx.platforms.includes(platformKey)) {
        throw new Error(`${entry.label} is not available for this platform.`);
      }
      const { namespace, extension, version } = entry.openVsx;
      const metadataPath = `/api/${namespace}/${extension}/${platformKey}/${version}`;
      const response = await fetch(`https://open-vsx.org${metadataPath}`, {
        signal,
        headers: { Accept: "application/json", "User-Agent": `Axon/${app.getVersion()}` },
      });
      if (!response.ok) {
        throw new Error(`Open VSX returned ${response.status} while resolving tools.`);
      }
      const metadata = (await response.json()) as OpenVsxVersionPayload;
      const expectedFilePrefix = `${metadataPath}/file/`;
      if (
        metadata.namespace !== namespace ||
        metadata.name !== extension ||
        metadata.version !== version ||
        metadata.targetPlatform !== platformKey ||
        metadata.verified !== true ||
        !metadata.files?.download ||
        !metadata.files.sha256 ||
        !isAllowedOpenVsxUrl(metadata.files.download, expectedFilePrefix) ||
        !isAllowedOpenVsxUrl(metadata.files.sha256, expectedFilePrefix)
      ) {
        throw new Error("Open VSX did not provide a verified platform package.");
      }

      const [checksumResponse, downloadMetadata] = await Promise.all([
        fetch(metadata.files.sha256, { signal, headers: { "User-Agent": `Axon/${app.getVersion()}` } }),
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
        throw new Error("Open VSX did not provide verifiable package metadata.");
      }
      return {
        version,
        name: `${namespace}.${extension}-${version}@${platformKey}.vsix`,
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

    if (!entry.assetNames[platformKey] && !entry.assetPatterns?.[platformKey]) {
      throw new Error(`${entry.label} is not available for this platform.`);
    }

    if (!entry.repository) {
      throw new Error(`${entry.label} does not have a configured download source.`);
    }
    if (!entry.githubTag || !entry.expectedSha256ByPlatform?.[platformKey]) {
      throw new Error(`${entry.label} does not have a pinned release checksum.`);
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
      throw new Error(`GitHub returned ${response.status} while resolving tools.`);
    }
    const release = (await response.json()) as GitHubReleasePayload;
    const assetName = findManagedLanguageToolAssetName(
      entry,
      (release.assets ?? []).flatMap((candidate) =>
        candidate.name ? [candidate.name] : [],
      ),
    );
    const asset = release.assets?.find((candidate) => candidate.name === assetName);
    const digest = asset?.digest?.match(/^sha256:([a-f0-9]{64})$/i)?.[1];
    if (
      !release.tag_name ||
      release.tag_name !== entry.githubTag ||
      !asset?.name ||
      !asset.browser_download_url ||
      !digest ||
      !isAllowedDownloadUrl(entry.repository, asset.browser_download_url)
    ) {
      throw new Error("The upstream release did not provide a verifiable tool asset.");
    }
    if (digest.toLowerCase() !== entry.expectedSha256ByPlatform[platformKey]) {
      throw new Error("The upstream release checksum does not match Axon's catalog.");
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

  private async downloadAsset(
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
      throw new Error("The language tool download redirected to an untrusted host.");
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
          throw new Error("The language tool download exceeded its declared size.");
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
      throw new Error("The downloaded language tool failed checksum verification.");
    }
  }

  private async installArchive(
    entry: ManagedLanguageToolCatalogEntry,
    asset: ResolvedToolAsset,
    archivePath: string,
    signal: AbortSignal,
  ) {
    const toolRoot = this.getToolRoot(entry.id);
    const stagingRoot = `${toolRoot}.installing-${process.pid}-${Date.now()}`;
    const runtimeRoot = path.join(stagingRoot, "runtime");
    await fs.mkdir(runtimeRoot, { recursive: true });

    if (asset.name.endsWith(".zip") || asset.name.endsWith(".vsix")) {
      await extractZipArchive(archivePath, runtimeRoot);
    } else if (asset.name.endsWith(".gz") && !asset.name.endsWith(".tar.gz")) {
      await extractGzipExecutable(archivePath, asset.name, runtimeRoot);
    } else {
      await extractTarArchive(archivePath, runtimeRoot);
    }
    signal.throwIfAborted();
    const executablePath = await findExecutable(
      runtimeRoot,
      entry.executableNames,
    );
    if (!executablePath) {
      throw new Error("The language tool archive did not contain its executable.");
    }

    const binRoot = path.join(stagingRoot, "bin");
    await fs.mkdir(binRoot, { recursive: true });
    const installedExecutablePath = path.join(
      binRoot,
      process.platform === "win32"
        ? entry.windowsCommandName
        : entry.commandName,
    );
    const relativeExecutable = path.relative(binRoot, executablePath);
    if (process.platform === "win32") {
      if (/[%"\r\n]/.test(relativeExecutable)) {
        throw new Error("The language tool executable has an unsafe Windows path.");
      }
      await fs.writeFile(
        installedExecutablePath,
        `@echo off\r\n"%~dp0\\${relativeExecutable}" %*\r\n`,
        "utf8",
      );
    } else {
      const portableRelativePath = relativeExecutable
        .split(path.sep)
        .join("/")
        .replace(/'/g, `'"'"'`);
      await fs.writeFile(
        installedExecutablePath,
        `#!/usr/bin/env sh\nDIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec "$DIR"/'${portableRelativePath}' "$@"\n`,
        { encoding: "utf8", mode: 0o755 },
      );
      await fs.chmod(executablePath, 0o755);
    }
    await fs.writeFile(
      path.join(stagingRoot, "install.json"),
      JSON.stringify(
        {
          id: entry.id,
          version: asset.version,
          asset: asset.name,
          checksumAlgorithm: asset.hashAlgorithm,
          checksum: asset.checksum,
          installedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );

    const previousRoot = `${toolRoot}.previous`;
    signal.throwIfAborted();
    await fs.rm(previousRoot, { recursive: true, force: true });
    await fs.mkdir(path.dirname(toolRoot), { recursive: true });
    await fs.rename(toolRoot, previousRoot).catch(() => undefined);
    try {
      await fs.rename(stagingRoot, toolRoot);
      await fs.rm(previousRoot, { recursive: true, force: true });
    } catch (error) {
      await fs.rename(previousRoot, toolRoot).catch(() => undefined);
      throw error;
    } finally {
      await fs.rm(stagingRoot, { recursive: true, force: true });
    }
  }

  async install(
    id: ManagedLanguageToolId,
    targetWindow: BrowserWindow | null,
  ): Promise<ManagedLanguageToolInstallResult> {
    const activeInstallation = this.installations.get(id);
    if (activeInstallation) return activeInstallation.promise;

    const controller = new AbortController();
    const installation: {
      promise: Promise<ManagedLanguageToolInstallResult>;
      controller: AbortController;
      dependencyId?: ManagedLanguageToolId;
    } = { promise: Promise.resolve(null as never), controller };
    installation.promise = this.installOnce(
      id,
      targetWindow,
      controller.signal,
      installation,
    ).finally(() => {
      this.installations.delete(id);
    });
    this.installations.set(id, installation);
    return installation.promise;
  }

  private async installOnce(
    id: ManagedLanguageToolId,
    targetWindow: BrowserWindow | null,
    signal: AbortSignal,
    installation: { dependencyId?: ManagedLanguageToolId },
  ): Promise<ManagedLanguageToolInstallResult> {
    const entry = getManagedLanguageToolCatalogEntry(id);
    if (!entry) throw new Error(`Unknown managed language tool: ${id}`);
    for (const dependencyId of entry.dependencies ?? []) {
      const dependencyStatus = await this.getStatus(dependencyId);
      if (dependencyStatus.installed) continue;
      if (signal.aborted) {
        const message = `${entry.label} installation was cancelled.`;
        this.publish(targetWindow, { id, phase: "cancelled", message });
        return { ok: false, message, status: await this.getStatus(id) };
      }
      installation.dependencyId = dependencyId;
      this.publish(targetWindow, {
        id,
        phase: "resolving",
        message: `Installing required ${dependencyStatus.label} runtime support.`,
      });
      const dependencyResult = await this.install(dependencyId, targetWindow);
      installation.dependencyId = undefined;
      if (signal.aborted) {
        const message = `${entry.label} installation was cancelled.`;
        this.publish(targetWindow, { id, phase: "cancelled", message });
        return { ok: false, message, status: await this.getStatus(id) };
      }
      if (!dependencyResult.ok) {
        return {
          ok: false,
          message: `${entry.label} requires ${dependencyStatus.label}: ${dependencyResult.message}`,
          status: await this.getStatus(id),
        };
      }
    }
    const temporaryRoot = await fs.mkdtemp(
      path.join(app.getPath("temp"), `axon-${id}-`),
    );
    const archivePath = path.join(temporaryRoot, "tool.archive");

    try {
      this.publish(targetWindow, { id, phase: "resolving" });
      signal.throwIfAborted();
      const asset = await this.resolveAsset(entry, signal);
      this.publish(targetWindow, {
        id,
        phase: "downloading",
        transferred: 0,
        total: asset.size,
        percent: 0,
      });
      await this.downloadAsset(entry, asset, archivePath, targetWindow, signal);
      signal.throwIfAborted();
      this.publish(targetWindow, { id, phase: "verifying" });
      this.publish(targetWindow, { id, phase: "installing" });
      await this.installArchive(entry, asset, archivePath, signal);
      this.publish(targetWindow, { id, phase: "installed", percent: 100 });
      return {
        ok: true,
        message: `${entry.label} language tools were installed.`,
        status: await this.getStatus(id),
      };
    } catch (error) {
      if (signal.aborted) {
        const message = `${entry.label} installation was cancelled.`;
        this.publish(targetWindow, { id, phase: "cancelled", message });
        return { ok: false, message, status: await this.getStatus(id) };
      }
      const message = error instanceof Error ? error.message : String(error);
      this.publish(targetWindow, { id, phase: "error", message });
      return { ok: false, message, status: await this.getStatus(id) };
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  }

  cancel(id: ManagedLanguageToolId) {
    const installation = this.installations.get(id);
    if (!installation) return false;
    installation.controller.abort();
    if (installation.dependencyId) this.cancel(installation.dependencyId);
    return true;
  }

  async uninstall(id: ManagedLanguageToolId): Promise<ManagedLanguageToolInstallResult> {
    const entry = getManagedLanguageToolCatalogEntry(id);
    if (!entry) throw new Error(`Unknown managed language tool: ${id}`);
    if (this.installations.has(id)) {
      return {
        ok: false,
        message: `${entry.label} is currently installing. Cancel it first.`,
        status: await this.getStatus(id),
      };
    }
    const status = await this.getStatus(id);
    if (status.requiredBy.length > 0) {
      return {
        ok: false,
        message: `${entry.label} is still required by ${status.requiredBy.join(", ")}.`,
        status,
      };
    }

    await fs.rm(this.getToolRoot(id), { recursive: true, force: true });
    for (const dependencyId of entry.dependencies ?? []) {
      const dependencyEntry = getManagedLanguageToolCatalogEntry(dependencyId);
      if (!dependencyEntry?.hidden) continue;
      const dependencyStatus = await this.getStatus(dependencyId);
      if (dependencyStatus.requiredBy.length === 0) {
        await fs.rm(this.getToolRoot(dependencyId), {
          recursive: true,
          force: true,
        });
      }
    }
    return {
      ok: true,
      message: `${entry.label} language tools were uninstalled.`,
      status: await this.getStatus(id),
    };
  }
}
