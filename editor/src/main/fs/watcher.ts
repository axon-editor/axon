import chokidar, { type FSWatcher } from "chokidar";
import fs from "fs";

interface FileWatcherDependencies {
  shouldPollWatchers: boolean;
  shouldIgnoreWorkspaceWatchPath: (candidatePath: string) => boolean;
  sendToRenderer: (channel: string, payload?: unknown) => void;
  getGitWatchPaths: (folderPath: string) => Promise<string[]>;
  stopAllLanguageServers: () => void;
}

export class FileWatcherManager {
  private activeWatcher: FSWatcher | null = null;
  private folderWatcher: FSWatcher | null = null;
  private gitWatcher: FSWatcher | null = null;

  constructor(private readonly deps: FileWatcherDependencies) {}

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
    if (!this.activeWatcher) return;
    await this.activeWatcher.close();
    this.activeWatcher = null;
  }

  async closeFolderWatcher() {
    if (!this.folderWatcher) return;
    await this.folderWatcher.close();
    this.folderWatcher = null;
  }

  async closeGitWatcher() {
    if (!this.gitWatcher) return;
    await this.gitWatcher.close();
    this.gitWatcher = null;
  }

  async watchFile(filePath: string) {
    await this.closeActiveWatcher();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    this.activeWatcher = chokidar.watch(filePath, this.buildWatcherOptions());

    this.activeWatcher.on("change", () => {
      if (debounceTimer) clearTimeout(debounceTimer);

      debounceTimer = setTimeout(() => {
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
      }, 150);
    });

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
    await this.closeFolderWatcher();
    await this.closeGitWatcher();
    this.deps.stopAllLanguageServers();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let gitDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    this.folderWatcher = chokidar.watch(folderPath, {
      ...this.buildWatcherOptions(),
      ignored: this.deps.shouldIgnoreWorkspaceWatchPath,
      depth: 8,
    });

    const notify = (changedPath: string) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.deps.sendToRenderer("fs:folderChanged", { path: changedPath });
        // New untracked files and deleted files do not always mutate the small
        // set of .git paths we watch quickly enough for the sidebar colors to
        // feel live. I refresh Git status from the normal folder watcher too so
        // the tree and Git decorations move together after creates, imports,
        // edits, and deletes.
        this.deps.sendToRenderer("git:changed");
      }, 90);
    };

    this.folderWatcher.on("add", notify);
    this.folderWatcher.on("change", notify);
    this.folderWatcher.on("unlink", notify);
    this.folderWatcher.on("addDir", notify);
    this.folderWatcher.on("unlinkDir", notify);

    const gitWatchPaths = await this.deps.getGitWatchPaths(folderPath);
    if (gitWatchPaths.length > 0) {
      this.gitWatcher = chokidar.watch(gitWatchPaths, {
        ...this.buildWatcherOptions(),
        depth: 4,
      });

      const notifyGit = () => {
        if (gitDebounceTimer) clearTimeout(gitDebounceTimer);
        gitDebounceTimer = setTimeout(() => {
          this.deps.sendToRenderer("git:changed");
        }, 90);
      };

      this.gitWatcher.on("add", notifyGit);
      this.gitWatcher.on("change", notifyGit);
      this.gitWatcher.on("unlink", notifyGit);
      this.gitWatcher.on("addDir", notifyGit);
      this.gitWatcher.on("unlinkDir", notifyGit);
    }
  }

  async unwatchFolder() {
    await this.closeFolderWatcher();
    await this.closeGitWatcher();
  }

  async closeAll() {
    await this.closeActiveWatcher();
    await this.closeFolderWatcher();
    await this.closeGitWatcher();
  }
}
