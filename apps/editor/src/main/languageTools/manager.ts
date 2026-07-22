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
  type ManagedLanguageToolCatalogEntry,
} from "./catalog";
import {
  ManagedLanguageToolAssetService,
  type ResolvedToolAsset,
} from "./assets";
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

interface ManagedLanguageToolManagerDependencies {
  sendToRenderer: (
    channel: string,
    payload: unknown,
    targetWindow?: BrowserWindow | null,
  ) => void;
}

export class ManagedLanguageToolManager {
  private readonly assets: ManagedLanguageToolAssetService;
  private readonly installations = new Map<
    ManagedLanguageToolId,
    {
      promise: Promise<ManagedLanguageToolInstallResult>;
      controller: AbortController;
      dependencyId?: ManagedLanguageToolId;
      targetWindows: Set<BrowserWindow>;
    }
  >();
  private readonly latestProgress = new Map<
    ManagedLanguageToolId,
    ManagedLanguageToolProgress
  >();
  private readonly progressMirrors = new Map<
    ManagedLanguageToolId,
    Set<ManagedLanguageToolId>
  >();

  constructor(private readonly deps: ManagedLanguageToolManagerDependencies) {
    this.assets = new ManagedLanguageToolAssetService(
      (targetWindow, progress) => this.publish(targetWindow, progress),
    );
  }

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

  private async cleanupStaleInstallationRoots(toolRoot: string) {
    const parentRoot = path.dirname(toolRoot);
    const prefix = `${path.basename(toolRoot)}.installing-`;
    const entries = await fs
      .readdir(parentRoot, { withFileTypes: true })
      .catch(() => []);
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
        .map((entry) =>
          fs.rm(path.join(parentRoot, entry.name), {
            recursive: true,
            force: true,
          }),
        ),
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

  async getStatus(
    id: ManagedLanguageToolId,
  ): Promise<ManagedLanguageToolStatus> {
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
        const dependencyEntry =
          getManagedLanguageToolCatalogEntry(dependencyId);
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
      .catch(() => ({}) as { version?: string });
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
      detail:
        executableInstalled && missingDependencies.length > 0
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
    this.deliverProgress(targetWindow, progress);
    for (const parentId of this.progressMirrors.get(progress.id) ?? []) {
      const dependencyLabel =
        getManagedLanguageToolCatalogEntry(progress.id)?.label ??
        "Required runtime";
      const mirroredMessage =
        progress.message ??
        (progress.phase === "downloading"
          ? `Downloading ${dependencyLabel}.`
          : progress.phase === "verifying"
            ? `Verifying ${dependencyLabel}.`
            : progress.phase === "extracting"
              ? `Extracting ${dependencyLabel}.`
              : progress.phase === "installing"
                ? `Finalizing ${dependencyLabel}.`
                : progress.phase === "cancelling"
                  ? `Cancelling ${dependencyLabel} installation.`
                  : undefined);
      const mirroredProgress = {
        ...progress,
        id: parentId,
        phase: progress.phase === "installed" ? "resolving" : progress.phase,
        message:
          progress.phase === "installed"
            ? "Required runtime installed. Continuing language server installation."
            : mirroredMessage,
      } satisfies ManagedLanguageToolProgress;
      this.deliverProgress(null, mirroredProgress);
    }
  }

  private deliverProgress(
    targetWindow: BrowserWindow | null,
    progress: ManagedLanguageToolProgress,
  ) {
    this.latestProgress.set(progress.id, progress);
    const targets = new Set<BrowserWindow>();
    if (targetWindow) targets.add(targetWindow);
    for (const window of this.installations.get(progress.id)?.targetWindows ??
      []) {
      targets.add(window);
    }
    for (const window of targets) {
      this.deps.sendToRenderer("languageTools:progress", progress, window);
    }
  }

  getInstallProgress(
    id: ManagedLanguageToolId,
    targetWindow: BrowserWindow | null = null,
  ) {
    const installation = this.installations.get(id);
    if (!installation) return null;
    if (targetWindow) installation.targetWindows.add(targetWindow);
    return this.latestProgress.get(id) ?? { id, phase: "resolving" as const };
  }

  listInstallProgress(targetWindow: BrowserWindow | null = null) {
    return Array.from(this.installations.entries()).map(
      ([id, installation]) => {
        if (targetWindow) installation.targetWindows.add(targetWindow);
        return (
          this.latestProgress.get(id) ?? { id, phase: "resolving" as const }
        );
      },
    );
  }

  private async installArchive(
    entry: ManagedLanguageToolCatalogEntry,
    asset: ResolvedToolAsset,
    archivePath: string,
    signal: AbortSignal,
    onExtracted: () => void,
  ) {
    const toolRoot = this.getToolRoot(entry.id);
    await this.cleanupStaleInstallationRoots(toolRoot);
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
      onExtracted();
      const executablePath = await findExecutable(
        runtimeRoot,
        entry.executableNames,
        signal,
      );
      if (!executablePath) {
        throw new Error(
          "The language tool archive did not contain its executable.",
        );
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
          throw new Error(
            "The PowerShell runtime dependency is not configured.",
          );
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
          signal,
        );
        if (!javaPath) {
          throw new Error("Axon's managed Java runtime does not contain Java.");
        }
        const metalsName =
          process.platform === "win32" ? "metals.bat" : "metals";
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
          throw new Error(
            "The language tool executable has an unsafe Windows path.",
          );
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
    await this.cleanupStaleInstallationRoots(toolRoot);
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
    if (activeInstallation) {
      if (targetWindow) activeInstallation.targetWindows.add(targetWindow);
      const progress = this.getInstallProgress(id, targetWindow);
      if (progress && targetWindow) {
        this.deps.sendToRenderer(
          "languageTools:progress",
          progress,
          targetWindow,
        );
      }
      return activeInstallation.promise;
    }

    const controller = new AbortController();
    const installation: {
      promise: Promise<ManagedLanguageToolInstallResult>;
      controller: AbortController;
      dependencyId?: ManagedLanguageToolId;
      targetWindows: Set<BrowserWindow>;
    } = {
      promise: Promise.resolve(null as never),
      controller,
      targetWindows: new Set(targetWindow ? [targetWindow] : []),
    };
    installation.promise = this.installOnce(
      id,
      targetWindow,
      controller.signal,
      installation,
    ).finally(() => {
      this.installations.delete(id);
      this.latestProgress.delete(id);
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
      const parents = this.progressMirrors.get(dependencyId) ?? new Set();
      parents.add(id);
      this.progressMirrors.set(dependencyId, parents);
      this.publish(targetWindow, {
        id,
        phase: "resolving",
        message: `Installing required ${dependencyStatus.label} runtime support.`,
      });
      const dependencyResult = await this.install(
        dependencyId,
        targetWindow,
      ).finally(() => {
        const currentParents = this.progressMirrors.get(dependencyId);
        currentParents?.delete(id);
        if (currentParents?.size === 0) {
          this.progressMirrors.delete(dependencyId);
        }
      });
      installation.dependencyId = undefined;
      if (signal.aborted) {
        const message = `${entry.label} installation was cancelled.`;
        this.publish(targetWindow, { id, phase: "cancelled", message });
        return { ok: false, message, status: await this.getStatus(id) };
      }
      if (!dependencyResult.ok) {
        const result = {
          ok: false,
          message: `${entry.label} requires ${dependencyStatus.label}: ${dependencyResult.message}`,
          status: await this.getStatus(id),
        };
        this.publish(targetWindow, {
          id,
          phase: dependencyResult.message.endsWith(
            "installation was cancelled.",
          )
            ? "cancelled"
            : "error",
          message: result.message,
        });
        return result;
      }
    }
    const temporaryRoot = await fs.mkdtemp(
      path.join(app.getPath("temp"), `axon-${id}-`),
    );
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
      const asset = await this.assets.resolveAsset(entry, signal);
      this.publish(targetWindow, {
        id,
        phase: "downloading",
        transferred: 0,
        total: asset.size,
        percent: 0,
      });
      await this.assets.downloadAsset(
        entry,
        asset,
        archivePath,
        targetWindow,
        signal,
      );
      signal.throwIfAborted();
      this.publish(targetWindow, { id, phase: "verifying" });
      this.publish(targetWindow, { id, phase: "extracting" });
      await this.installArchive(entry, asset, archivePath, signal, () =>
        this.publish(targetWindow, { id, phase: "installing" }),
      );
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
    this.publish(null, {
      id,
      phase: "cancelling",
      message: "Cancelling language tool installation.",
    });
    installation.controller.abort();
    if (installation.dependencyId) this.cancel(installation.dependencyId);
    return true;
  }

  async uninstall(
    id: ManagedLanguageToolId,
  ): Promise<ManagedLanguageToolInstallResult> {
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
