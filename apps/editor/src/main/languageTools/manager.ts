import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";
import { app, type BrowserWindow } from "electron";
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
import { extractLanguageToolArchive, findExecutable } from "./archive";
import {
  installEcosystemTool,
  resolveRuntimeCommand,
  runManagedToolCommand,
} from "./ecosystemInstaller";
import {
  writeMetalsLauncher,
  writePowerShellEditorServicesLauncher,
} from "./powershellLauncher";

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
      ["releases.hashicorp.com", "storage.googleapis.com", "download.swift.org"].includes(
        url.hostname,
      )
    );
  } catch {
    return false;
  }
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
      Object.values(entry.pinnedGithubAssets ?? {})[0]?.tag ??
      Object.values(entry.pinnedHttpsAssets ?? {})[0]?.version ??
      entry.dotnetSdk?.version ??
      entry.ecosystemInstaller?.version
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
    const ecosystemRuntime = entry.ecosystemInstaller
      ? await resolveRuntimeCommand(entry.ecosystemInstaller.runtimeCommands)
      : null;
    const assetName = Boolean(
      entry.assetNames[platformKey] ||
      entry.assetPatterns?.[platformKey] ||
      entry.openVsx?.platforms.includes(platformKey) ||
      entry.pinnedGithubAsset?.platforms.includes(platformKey) ||
      entry.pinnedGithubAssets?.[platformKey] ||
      entry.pinnedHttpsAssets?.[platformKey] ||
      entry.dotnetSdk?.ridByPlatform[platformKey] ||
      entry.openVsx?.platforms.includes("universal") ||
      ecosystemRuntime,
    );
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
          : entry.ecosystemInstaller
            ? `${entry.label} requires ${entry.ecosystemInstaller.runtimeCommands.join(" or ")} before Axon can install its language server.`
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
      const targetPlatform = entry.openVsx.platforms.includes(platformKey)
        ? platformKey
        : entry.openVsx.platforms.includes("universal")
          ? "universal"
          : null;
      if (!targetPlatform) {
        throw new Error(`${entry.label} is not available for this platform.`);
      }
      const { namespace, extension, version } = entry.openVsx;
      const metadataPath = targetPlatform === "universal"
        ? `/api/${namespace}/${extension}/${version}`
        : `/api/${namespace}/${extension}/${targetPlatform}/${version}`;
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
        metadata.targetPlatform !== targetPlatform ||
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
        throw new Error(`${entry.label} does not have a configured download source.`);
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
    if (
      isAllowedPinnedHttpsUrl(asset.downloadUrl) &&
      !isAllowedPinnedHttpsUrl(response.url)
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

    try {
      await extractLanguageToolArchive({
        archivePath,
        assetName: asset.name,
        destination: runtimeRoot,
        signal,
      });
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
      if (entry.launcher?.kind === "powershell-editor-services") {
        const dependencyEntry = getManagedLanguageToolCatalogEntry(
          entry.launcher.runtimeDependency,
        );
        if (!dependencyEntry) {
          throw new Error("The PowerShell runtime dependency is not configured.");
        }
        const finalScriptPath = path.join(
          toolRoot,
          path.relative(stagingRoot, executablePath),
        );
        await writePowerShellEditorServicesLauncher({
          launcherPath: installedExecutablePath,
          scriptPath: finalScriptPath,
          runtimePath: this.getExecutablePath(dependencyEntry),
          toolRoot,
          version: asset.version,
        });
      } else if (entry.launcher?.kind === "java-coursier") {
        const dependencyEntry = getManagedLanguageToolCatalogEntry(
          entry.launcher.runtimeDependency,
        );
        const artifact = entry.launcher.artifact;
        if (!dependencyEntry || !artifact) {
          throw new Error("The Scala runtime bootstrap is not configured.");
        }
        const javaPath = await findExecutable(
          path.join(this.getToolRoot(dependencyEntry.id), "runtime"),
          ["java", "java.exe"],
        );
        if (!javaPath) {
          throw new Error("Axon's managed Java runtime does not contain Java.");
        }
        const metalsName = process.platform === "win32" ? "metals.bat" : "metals";
        const stagedMetalsPath = path.join(runtimeRoot, metalsName);
        const javaHome = path.dirname(path.dirname(javaPath));
        await runManagedToolCommand({
          command: javaPath,
          args: [
            "-jar",
            executablePath,
            "bootstrap",
            artifact,
            "-o",
            stagedMetalsPath,
            "-f",
            "--java-opt",
            "-Xss4m",
            "--java-opt",
            "-Xms100m",
            "--java-opt",
            "-Dmetals.client=axon",
          ],
          cwd: runtimeRoot,
          env: {
            ...process.env,
            JAVA_HOME: javaHome,
            PATH: `${path.join(javaHome, "bin")}${path.delimiter}${process.env.PATH ?? ""}`,
            COURSIER_CACHE: path.join(stagingRoot, "cache"),
          },
          signal,
        });
        if (process.platform !== "win32") {
          await fs.chmod(stagedMetalsPath, 0o755);
        }
        await writeMetalsLauncher({
          launcherPath: installedExecutablePath,
          metalsPath: path.join(toolRoot, "runtime", metalsName),
          cacheRoot: path.join(toolRoot, "cache"),
        });
      } else if (process.platform === "win32") {
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

      await this.replaceToolRoot(toolRoot, stagingRoot, signal);
    } finally {
      await fs.rm(stagingRoot, { recursive: true, force: true });
    }
  }

  private async replaceToolRoot(
    toolRoot: string,
    stagingRoot: string,
    signal: AbortSignal,
  ) {
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
    }
  }

  private async installEcosystemPackage(
    entry: ManagedLanguageToolCatalogEntry,
    signal: AbortSignal,
  ) {
    const toolRoot = this.getToolRoot(entry.id);
    const stagingRoot = `${toolRoot}.installing-${process.pid}-${Date.now()}`;
    await fs.rm(stagingRoot, { recursive: true, force: true });
    await fs.mkdir(stagingRoot, { recursive: true });
    try {
      const version = await installEcosystemTool({
        entry,
        stagingRoot,
        finalToolRoot: toolRoot,
        signal,
      });
      signal.throwIfAborted();
      await fs.writeFile(
        path.join(stagingRoot, "install.json"),
        JSON.stringify(
          {
            id: entry.id,
            version,
            source: entry.ecosystemInstaller?.kind,
            installedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        "utf8",
      );
      await this.replaceToolRoot(toolRoot, stagingRoot, signal);
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
    const temporaryRoot = await fs.mkdtemp(path.join(app.getPath("temp"), `axon-${id}-`));
    const archivePath = path.join(temporaryRoot, "tool.archive");

    try {
      this.publish(targetWindow, { id, phase: "resolving" });
      signal.throwIfAborted();
      if (entry.ecosystemInstaller) {
        this.publish(targetWindow, { id, phase: "installing" });
        await this.installEcosystemPackage(entry, signal);
        const message = `${entry.label} language tools were installed.`;
        this.publish(targetWindow, { id, phase: "installed", message });
        return { ok: true, message, status: await this.getStatus(id) };
      }
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
