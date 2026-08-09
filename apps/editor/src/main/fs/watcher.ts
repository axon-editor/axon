import chokidar, {
  type ChokidarOptions,
  type FSWatcher as ChokidarWatcher,
} from "chokidar";
import fs from "fs";
import path from "path";
import { type FolderChangeKind } from "../../shared/fs";
import { textFileCache } from "../files/textFileCache";

type NativeWatcherListener = (
  eventType: "rename" | "change",
  fileName: string | Buffer | null,
) => void;

interface FileWatcherDependencies {
  shouldPollWatchers: boolean;
  shouldIgnoreWorkspaceWatchPath: (
    candidatePath: string,
    folderPath?: string,
  ) => boolean;
  sendToRenderer: (channel: string, payload?: unknown) => void;
  getGitWatchPaths: (folderPath: string) => Promise<string[]>;
  stopLanguageServersForFolder: (folderPath: string) => void | Promise<void>;
  notifyLanguageServersOfFileChange: (
    folderPath: string,
    filePath: string,
    changeType: "create" | "change" | "delete",
  ) => void;
  invalidateWorkspaceIndex: (folderPath: string) => void;
  createWatcher?: (
    paths: string | string[],
    options: ChokidarOptions,
  ) => ChokidarWatcher;
  createNativeWatcher?: (
    folderPath: string,
    listener: NativeWatcherListener,
  ) => Pick<fs.FSWatcher, "close">;
}

function waitForWatcherReady(
  watcher: ChokidarWatcher,
  isCurrent: () => boolean,
) {
  return new Promise<void>((resolve, reject) => {
    const finish = (callback: () => void) => {
      watcher.off("ready", handleReady);
      watcher.off("error", handleError);
      clearInterval(generationTimer);
      callback();
    };
    const handleReady = () => {
      finish(resolve);
    };
    const handleError = (error: unknown) => {
      finish(() => reject(error));
    };
    const generationTimer = setInterval(() => {
      if (!isCurrent()) finish(resolve);
    }, 25);
    watcher.once("ready", handleReady);
    watcher.once("error", handleError);
  });
}

const GIT_DISCOVERY_RETRY_DELAYS_MS = [120, 400, 1_000] as const;

const GENERATED_WORKSPACE_DIRECTORIES = new Set([
  "node_modules",
  "vendor",
  "dist",
  "release",
  "build",
  "out",
  "target",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".gradle",
  ".next",
  ".turbo",
  ".parcel-cache",
  ".cache",
  ".gocache",
  "gocache",
  "go-build",
  "coverage",
  "coverage-final",
]);

export function shouldIgnoreWorkspaceWatchPath(
  candidatePath: string,
  folderPath?: string,
) {
  const relativePath = folderPath
    ? path.relative(path.resolve(folderPath), path.resolve(candidatePath))
    : candidatePath;
  const segments = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);

  // The ignore check must operate on workspace-relative segments. Inspecting
  // the full absolute path made every event disappear when a project happened
  // to live below an ancestor named `build`, `dist`, or `target`.
  return segments.some((segment) => {
    const normalizedSegment = segment.toLowerCase();
    if (normalizedSegment === ".git" || normalizedSegment === ".ds_store") {
      return true;
    }
    if (GENERATED_WORKSPACE_DIRECTORIES.has(normalizedSegment)) return true;
    return (
      normalizedSegment.startsWith(".cache") ||
      normalizedSegment.startsWith("go-build") ||
      normalizedSegment.includes("gocache") ||
      normalizedSegment.endsWith("-cache")
    );
  });
}

export class FileWatcherManager {
  private activeWatcher: ChokidarWatcher | null = null;
  private folderWatcher: ChokidarWatcher | null = null;
  private gitWatcher: ChokidarWatcher | null = null;
  private nativeFolderWatcher: Pick<fs.FSWatcher, "close"> | null = null;
  private activeFileDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private folderDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingFolderChanges = new Map<string, FolderChangeKind>();
  private gitDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private gitDiscoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private gitWatcherSetupPromise: Promise<boolean> | null = null;
  private gitWatcherGeneration = 0;
  private folderWatchGeneration = 0;
  private watchedFolderPath: string | null = null;

  constructor(private readonly deps: FileWatcherDependencies) {}

  private createWatcher(paths: string | string[], options: ChokidarOptions) {
    return (
      this.deps.createWatcher?.(paths, options) ??
      chokidar.watch(paths, options)
    );
  }

  buildWatcherOptions() {
    return {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 80,
        pollInterval: 30,
      },
      atomic: true,
      // Polling is intentionally opt-in. It can help debug rare native watcher
      // failures, but it is too expensive as the default on older MacBooks
      // because every watched workspace path gets checked on an interval.
      usePolling: this.deps.shouldPollWatchers,
      interval: 400,
      binaryInterval: 800,
    };
  }

  shouldIgnoreWorkspaceWatchPath(candidatePath: string) {
    return shouldIgnoreWorkspaceWatchPath(candidatePath);
  }

  async closeActiveWatcher() {
    if (this.activeFileDebounceTimer) {
      clearTimeout(this.activeFileDebounceTimer);
      this.activeFileDebounceTimer = null;
    }
    if (!this.activeWatcher) return;
    await this.activeWatcher.close();
    this.activeWatcher = null;
  }

  async closeFolderWatcher() {
    if (this.folderDebounceTimer) {
      clearTimeout(this.folderDebounceTimer);
      this.folderDebounceTimer = null;
    }
    this.pendingFolderChanges.clear();
    this.nativeFolderWatcher?.close();
    this.nativeFolderWatcher = null;
    if (!this.folderWatcher) return;
    await this.folderWatcher.close();
    this.folderWatcher = null;
  }

  async closeGitWatcher() {
    this.gitWatcherGeneration += 1;
    this.gitWatcherSetupPromise = null;
    if (this.gitDiscoveryTimer) {
      clearTimeout(this.gitDiscoveryTimer);
      this.gitDiscoveryTimer = null;
    }
    if (this.gitDebounceTimer) {
      clearTimeout(this.gitDebounceTimer);
      this.gitDebounceTimer = null;
    }
    if (!this.gitWatcher) return;
    await this.gitWatcher.close();
    this.gitWatcher = null;
  }

  private isRootGitMetadataPath(folderPath: string, candidatePath: string) {
    return (
      path.resolve(candidatePath) ===
      path.join(path.resolve(folderPath), ".git")
    );
  }

  private async createGitWatcher(folderPath: string, generation: number) {
    const gitWatcherGeneration = this.gitWatcherGeneration;
    const gitWatchPaths = await this.deps.getGitWatchPaths(folderPath);
    if (
      generation !== this.folderWatchGeneration ||
      gitWatcherGeneration !== this.gitWatcherGeneration ||
      gitWatchPaths.length === 0
    ) {
      return false;
    }

    const watcher = this.createWatcher(gitWatchPaths, {
      ...this.buildWatcherOptions(),
      // Git watch paths are intentionally narrow (`HEAD`, `index`, `refs`,
      // etc). A shallow depth keeps rebase/fetch updates visible without
      // walking deep object directories on repositories with many refs.
      depth: 2,
    });
    if (
      generation !== this.folderWatchGeneration ||
      gitWatcherGeneration !== this.gitWatcherGeneration
    ) {
      await watcher.close();
      return false;
    }
    this.gitWatcher = watcher;

    const notifyGit = () => {
      if (this.gitDebounceTimer) clearTimeout(this.gitDebounceTimer);
      // This timer is also instance-owned so closeGitWatcher can cancel it
      // during rapid workspace changes. Otherwise a delayed git:changed event
      // can repaint source-control state for the wrong workspace.
      this.gitDebounceTimer = setTimeout(() => {
        this.gitDebounceTimer = null;
        if (generation !== this.folderWatchGeneration) return;
        this.deps.sendToRenderer("git:changed", { folderPath });
      }, 90);
    };

    watcher.on("add", notifyGit);
    watcher.on("change", notifyGit);
    watcher.on("unlink", notifyGit);
    watcher.on("addDir", notifyGit);
    watcher.on("unlinkDir", notifyGit);
    watcher.on("error", (err) => {
      console.warn(
        `Git watcher failed for ${folderPath}:`,
        err instanceof Error ? err.message : err,
      );
    });

    return true;
  }

  private ensureGitWatcher(folderPath: string, generation: number) {
    if (this.gitWatcher) return Promise.resolve(true);
    if (this.gitWatcherSetupPromise) return this.gitWatcherSetupPromise;

    const setupPromise = this.createGitWatcher(folderPath, generation).finally(
      () => {
        if (this.gitWatcherSetupPromise === setupPromise) {
          this.gitWatcherSetupPromise = null;
        }
      },
    );
    this.gitWatcherSetupPromise = setupPromise;
    return setupPromise;
  }

  private scheduleGitWatcherDiscovery(
    folderPath: string,
    generation: number,
    attempt = 0,
  ) {
    if (generation !== this.folderWatchGeneration || this.gitWatcher) return;
    if (this.gitDiscoveryTimer) clearTimeout(this.gitDiscoveryTimer);

    const delay = GIT_DISCOVERY_RETRY_DELAYS_MS[attempt];
    if (delay === undefined) return;
    this.gitDiscoveryTimer = setTimeout(() => {
      this.gitDiscoveryTimer = null;
      void this.ensureGitWatcher(folderPath, generation)
        .then((started) => {
          if (!started) {
            this.scheduleGitWatcherDiscovery(
              folderPath,
              generation,
              attempt + 1,
            );
          }
        })
        .catch((error) => {
          console.warn(
            `Git watcher discovery failed for ${folderPath}:`,
            error instanceof Error ? error.message : error,
          );
          this.scheduleGitWatcherDiscovery(folderPath, generation, attempt + 1);
        });
    }, delay);
  }

  async watchFile(filePath: string) {
    await this.closeActiveWatcher();

    this.activeWatcher = this.createWatcher(
      filePath,
      this.buildWatcherOptions(),
    );

    const reloadActiveFile = () => {
      if (this.activeFileDebounceTimer)
        clearTimeout(this.activeFileDebounceTimer);

      this.activeFileDebounceTimer = setTimeout(() => {
        this.activeFileDebounceTimer = null;
        try {
          textFileCache.invalidate(filePath);
          const content = fs.readFileSync(filePath, "utf-8");
          // The file watcher can still fire during reload/close. Sending through
          // the shared renderer helper keeps external disk changes useful while
          // avoiding Electron's "Object has been destroyed" crash path.
          this.deps.sendToRenderer("fs:fileChanged", {
            path: filePath,
            content,
          });
        } catch (err) {
          // Chokidar can deliver a delayed change event after a file has been
          // deleted, moved, or replaced by an external cleanup. That should make
          // the editor show stale content until the tree refreshes, not throw
          // from the main process and take down the whole app while opening a
          // file. I close this one-file watcher because the path is no longer a
          // trustworthy source of content for the active pane.
          console.warn(
            `stopped watching unreadable file ${filePath}:`,
            err instanceof Error ? err.message : err,
          );
          void this.closeActiveWatcher();
        }
      }, 80);
    };

    this.activeWatcher.on("change", reloadActiveFile);
    this.activeWatcher.on("add", reloadActiveFile);

    this.activeWatcher.on("error", (err) => {
      // Watcher errors usually mean the underlying path disappeared or the OS
      // refused the watch after a cleanup. Keeping the error local prevents a
      // filesystem edge case from becoming an app-level crash.
      console.warn(
        `file watcher failed for ${filePath}:`,
        err instanceof Error ? err.message : err,
      );
      void this.closeActiveWatcher();
    });
  }

  async unwatchFile() {
    await this.closeActiveWatcher();
  }

  async watchFolder(folderPath: string) {
    const generation = ++this.folderWatchGeneration;
    const previousFolderPath = this.watchedFolderPath;
    await this.closeFolderWatcher();
    await this.closeGitWatcher();
    if (previousFolderPath && previousFolderPath !== folderPath) {
      await Promise.resolve(
        this.deps.stopLanguageServersForFolder(previousFolderPath),
      );
    }
    if (generation !== this.folderWatchGeneration) return;
    this.watchedFolderPath = folderPath;

    try {
      const pythonEnvironmentRoots = new Set<string>();
      const shouldIgnore = (
        candidatePath: string,
        candidateIsDirectory = false,
      ) => {
        if (
          this.deps.shouldIgnoreWorkspaceWatchPath(candidatePath, folderPath)
        ) {
          return true;
        }

        const resolvedCandidatePath = path.resolve(candidatePath);
        for (const environmentRoot of pythonEnvironmentRoots) {
          if (
            resolvedCandidatePath === environmentRoot ||
            resolvedCandidatePath.startsWith(`${environmentRoot}${path.sep}`)
          ) {
            return true;
          }
        }

        // Python environments can have any directory name. Detecting the
        // interpreter-owned marker at the environment root avoids crawling and
        // watching thousands of installed packages without hardcoding `.venv`,
        // while ordinary project folders remain visible and watchable.
        if (
          candidateIsDirectory &&
          fs.existsSync(path.join(resolvedCandidatePath, "pyvenv.cfg"))
        ) {
          pythonEnvironmentRoots.add(resolvedCandidatePath);
          return true;
        }
        return false;
      };

      const notify = (changedPath: string, kind: FolderChangeKind) => {
        if (shouldIgnore(changedPath)) return;
        textFileCache.invalidateTree(changedPath);
        const currentKind = this.pendingFolderChanges.get(changedPath);
        const nextKind =
          kind === "change" && currentKind && currentKind !== "change"
            ? currentKind
            : kind;
        this.pendingFolderChanges.set(changedPath, nextKind);
        if (this.folderDebounceTimer) clearTimeout(this.folderDebounceTimer);

        // Native and Chokidar events deliberately share one short queue. The
        // native recursive watcher reports immediately while Chokidar may still
        // be scanning; Chokidar then upgrades `unknown` rename events to an
        // accurate create/delete kind without making the renderer refresh twice.
        this.folderDebounceTimer = setTimeout(() => {
          this.folderDebounceTimer = null;
          if (generation !== this.folderWatchGeneration) return;
          const changedEntries = [...this.pendingFolderChanges.entries()];
          this.pendingFolderChanges.clear();
          this.deps.invalidateWorkspaceIndex(folderPath);
          this.deps.sendToRenderer("fs:folderChanged", {
            changes: changedEntries.map(
              ([changedEntryPath, changedEntryKind]) => ({
                path: changedEntryPath,
                kind: changedEntryKind,
              }),
            ),
          });
          this.deps.sendToRenderer("git:changed", {
            folderPath,
            paths: changedEntries.map(([changedEntryPath]) => changedEntryPath),
          });
        }, 24);
      };

      // fs.watch uses the operating system's recursive facility and starts
      // without walking every descendant first. This closes the startup gap in
      // large workspaces where an agent can create a deep file while Chokidar is
      // still discovering directories. Tests that inject a fake Chokidar watcher
      // stay deterministic unless they explicitly inject a native watcher too.
      const createNativeWatcher =
        this.deps.createNativeWatcher ??
        (this.deps.createWatcher
          ? null
          : (rootPath: string, listener: NativeWatcherListener) =>
              fs.watch(rootPath, { recursive: true }, listener));
      if (createNativeWatcher) {
        try {
          this.nativeFolderWatcher = createNativeWatcher(
            folderPath,
            (eventType, fileName) => {
              // Native `change` events can fire while an agent is still writing
              // the file. Chokidar's awaitWriteFinish path owns content reloads
              // so the renderer never reads and paints a partial intermediate
              // file. Native rename events remain the immediate structural path.
              if (eventType === "change") return;
              const changedPath = fileName
                ? path.resolve(folderPath, fileName.toString())
                : folderPath;
              notify(changedPath, "unknown");
            },
          );
        } catch (error) {
          console.warn(
            `native workspace watcher failed for ${folderPath}:`,
            error instanceof Error ? error.message : error,
          );
        }
      }

      this.folderWatcher = this.createWatcher(folderPath, {
        ...this.buildWatcherOptions(),
        ignored: (candidatePath, stats) => {
          // I keep the root .git boundary visible so a workspace can become a
          // repository after `git init`. Descendants still use the normal ignore
          // rule and are handled by the narrow Git watcher after discovery.
          if (this.isRootGitMetadataPath(folderPath, candidatePath)) {
            return false;
          }
          return shouldIgnore(candidatePath, stats?.isDirectory() ?? false);
        },
      });

      this.folderWatcher.on("add", (changedPath) => {
        // LSP file-watch notifications intentionally bypass the debounced tree
        // refresh path. Language servers maintain incremental workspace
        // indexes, so they need the concrete create/change/delete event for
        // each unopened file as soon as chokidar observes it.
        this.deps.notifyLanguageServersOfFileChange(
          folderPath,
          changedPath,
          "create",
        );
        notify(changedPath, "create");
        if (this.isRootGitMetadataPath(folderPath, changedPath)) {
          this.scheduleGitWatcherDiscovery(folderPath, generation);
        }
      });
      this.folderWatcher.on("change", (changedPath) => {
        this.deps.notifyLanguageServersOfFileChange(
          folderPath,
          changedPath,
          "change",
        );
        notify(changedPath, "change");
      });
      this.folderWatcher.on("unlink", (changedPath) => {
        this.deps.notifyLanguageServersOfFileChange(
          folderPath,
          changedPath,
          "delete",
        );
        notify(changedPath, "delete");
        if (this.isRootGitMetadataPath(folderPath, changedPath)) {
          void this.closeGitWatcher();
        }
      });
      this.folderWatcher.on("addDir", (changedPath) => {
        notify(changedPath, "create");
        if (this.isRootGitMetadataPath(folderPath, changedPath)) {
          this.scheduleGitWatcherDiscovery(folderPath, generation);
          this.deps.sendToRenderer("git:changed", {
            folderPath,
            paths: [changedPath],
          });
        }
      });
      this.folderWatcher.on("unlinkDir", (changedPath) => {
        notify(changedPath, "delete");
        if (this.isRootGitMetadataPath(folderPath, changedPath)) {
          void this.closeGitWatcher();
          this.deps.sendToRenderer("git:changed", {
            folderPath,
            paths: [changedPath],
          });
        }
      });
      this.folderWatcher.on("error", (err) => {
        console.warn(
          `workspace watcher failed for ${folderPath}:`,
          err instanceof Error ? err.message : err,
        );
      });

      await waitForWatcherReady(
        this.folderWatcher,
        () => generation === this.folderWatchGeneration,
      );
      if (generation !== this.folderWatchGeneration) return;

      // `ignoreInitial` avoids repainting once for every file in a large
      // workspace, but a file created while Chokidar performs that first scan
      // can otherwise be absorbed as an initial entry and never emit `add`.
      // One post-ready resync closes that startup window with a fixed amount of
      // work regardless of repository size.
      this.deps.invalidateWorkspaceIndex(folderPath);
      this.deps.sendToRenderer("fs:folderChanged", {
        path: folderPath,
        kind: "unknown",
      });
      this.deps.sendToRenderer("git:changed", { folderPath });

      const gitWatcherStarted = await this.ensureGitWatcher(
        folderPath,
        generation,
      );
      if (!gitWatcherStarted && fs.existsSync(path.join(folderPath, ".git"))) {
        this.scheduleGitWatcherDiscovery(folderPath, generation);
      }
    } catch (err) {
      // If git path discovery or watcher setup fails halfway through, the app
      // should not keep a partially initialized watcher around. Closing both
      // sides here returns the manager to a clean state so the next folder open
      // starts from known lifecycle boundaries.
      await this.closeFolderWatcher();
      await this.closeGitWatcher();
      throw err;
    }
  }

  async unwatchFolder() {
    this.folderWatchGeneration += 1;
    const folderPath = this.watchedFolderPath;
    this.watchedFolderPath = null;
    await this.closeFolderWatcher();
    await this.closeGitWatcher();
    if (folderPath) {
      await Promise.resolve(this.deps.stopLanguageServersForFolder(folderPath));
    }
  }

  async closeAll() {
    this.folderWatchGeneration += 1;
    this.watchedFolderPath = null;
    await this.closeActiveWatcher();
    await this.closeFolderWatcher();
    await this.closeGitWatcher();
  }
}
