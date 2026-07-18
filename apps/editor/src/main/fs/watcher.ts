import chokidar, { type ChokidarOptions, type FSWatcher } from "chokidar";
import fs from "fs";
import path from "path";

interface FileWatcherDependencies {
  shouldPollWatchers: boolean;
  shouldIgnoreWorkspaceWatchPath: (candidatePath: string) => boolean;
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
  ) => FSWatcher;
}

function waitForWatcherReady(watcher: FSWatcher, isCurrent: () => boolean) {
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

export class FileWatcherManager {
  private activeWatcher: FSWatcher | null = null;
  private folderWatcher: FSWatcher | null = null;
  private gitWatcher: FSWatcher | null = null;
  private activeFileDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private folderDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingFolderChangedPaths = new Set<string>();
  private gitDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private gitHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private gitDiscoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private gitWatcherSetupPromise: Promise<boolean> | null = null;
  private gitWatcherGeneration = 0;
  private folderWatchGeneration = 0;
  private watchedFolderPath: string | null = null;

  constructor(private readonly deps: FileWatcherDependencies) {}

  private createWatcher(paths: string | string[], options: ChokidarOptions) {
    return (
      this.deps.createWatcher?.(paths, options) ?? chokidar.watch(paths, options)
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
    const normalizedPath = candidatePath.replace(/\\/g, "/");
    const segments = normalizedPath.split("/").filter(Boolean);

    // Hidden project files are valid editor content. I only ignore folders/files
    // that are implementation noise or generated output, because ignoring every
    // dot-prefixed path makes newly created files such as .gitignore and release
    // workflow files invisible until the core tree filter is changed too.
    return segments.some((segment, index) => {
      if (segment === ".git" || segment === ".DS_Store") return true;
      if (
        segment === "node_modules" ||
        segment === "vendor" ||
        segment === "dist" ||
        segment === "release"
      ) {
        return true;
      }

      return (
        segment === "build" &&
        index < segments.length - 1 &&
        segments[index + 1] === "core"
      );
    });
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
    this.pendingFolderChangedPaths.clear();
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
    if (this.gitHeartbeatTimer) {
      clearInterval(this.gitHeartbeatTimer);
      this.gitHeartbeatTimer = null;
    }
    if (!this.gitWatcher) return;
    await this.gitWatcher.close();
    this.gitWatcher = null;
  }

  private isRootGitMetadataPath(folderPath: string, candidatePath: string) {
    return (
      path.resolve(candidatePath) === path.join(path.resolve(folderPath), ".git")
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

    // Native `change` events can occasionally disappear in packaged Electron
    // builds. I keep this heartbeat Git-only so decorations recover without
    // turning the complete workspace watcher into an expensive polling walk.
    this.gitHeartbeatTimer = setInterval(() => {
      if (generation !== this.folderWatchGeneration) return;
      this.deps.sendToRenderer("git:changed", { folderPath });
    }, 1_500);
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
      void this.ensureGitWatcher(folderPath, generation).then((started) => {
        if (!started) {
          this.scheduleGitWatcherDiscovery(folderPath, generation, attempt + 1);
        }
      }).catch((error) => {
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
    // Watchers are owned per renderer window. Only stop language servers for the
    // workspace this manager is replacing; stopping every session here makes a
    // second Axon window silently tear down the first window's language tools.
    if (previousFolderPath && previousFolderPath !== folderPath) {
      await Promise.resolve(
        this.deps.stopLanguageServersForFolder(previousFolderPath),
      );
    }
    if (generation !== this.folderWatchGeneration) return;
    this.watchedFolderPath = folderPath;

    try {
      this.folderWatcher = this.createWatcher(folderPath, {
        ...this.buildWatcherOptions(),
        ignored: (candidatePath) => {
          // I keep the root .git boundary visible so a workspace can become a
          // repository after `git init`. Descendants still use the normal ignore
          // rule and are handled by the narrow Git watcher after discovery.
          if (this.isRootGitMetadataPath(folderPath, candidatePath)) {
            return false;
          }
          return this.deps.shouldIgnoreWorkspaceWatchPath(candidatePath);
        },
        depth: 8,
      });

      const notify = (changedPath: string) => {
        this.pendingFolderChangedPaths.add(changedPath);
        if (this.folderDebounceTimer) clearTimeout(this.folderDebounceTimer);
        // The timer is stored on the manager, not as a local closure variable,
        // because workspace switches close the watcher before the last debounce
        // may have fired. closeFolderWatcher can now cancel this pending send
        // and prevent a stale tree refresh for a folder that is no longer open.
        this.folderDebounceTimer = setTimeout(() => {
          this.folderDebounceTimer = null;
          if (generation !== this.folderWatchGeneration) return;
          const changedPaths = [...this.pendingFolderChangedPaths];
          this.pendingFolderChangedPaths.clear();
          this.deps.invalidateWorkspaceIndex(folderPath);
          changedPaths.forEach((path) => {
            this.deps.sendToRenderer("fs:folderChanged", { path });
          });
          // New untracked files and deleted files do not always mutate the small
          // set of .git paths we watch quickly enough for the sidebar colors to
          // feel live. I refresh Git status from the normal folder watcher too so
          // the tree and Git decorations move together after creates, imports,
          // edits, and deletes.
          this.deps.sendToRenderer("git:changed", { folderPath });
        }, 90);
      };

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
        notify(changedPath);
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
        notify(changedPath);
      });
      this.folderWatcher.on("unlink", (changedPath) => {
        this.deps.notifyLanguageServersOfFileChange(
          folderPath,
          changedPath,
          "delete",
        );
        notify(changedPath);
        if (this.isRootGitMetadataPath(folderPath, changedPath)) {
          void this.closeGitWatcher();
        }
      });
      this.folderWatcher.on("addDir", (changedPath) => {
        notify(changedPath);
        if (this.isRootGitMetadataPath(folderPath, changedPath)) {
          this.scheduleGitWatcherDiscovery(folderPath, generation);
        }
      });
      this.folderWatcher.on("unlinkDir", (changedPath) => {
        notify(changedPath);
        if (this.isRootGitMetadataPath(folderPath, changedPath)) {
          void this.closeGitWatcher();
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
      this.deps.sendToRenderer("fs:folderChanged", { path: folderPath });
      this.deps.sendToRenderer("git:changed", { folderPath });

      const gitWatcherStarted = await this.ensureGitWatcher(
        folderPath,
        generation,
      );
      if (
        !gitWatcherStarted &&
        fs.existsSync(path.join(folderPath, ".git"))
      ) {
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
