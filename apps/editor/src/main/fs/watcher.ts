import chokidar, { type FSWatcher } from "chokidar";
import fs from "fs";

interface FileWatcherDependencies {
  shouldPollWatchers: boolean;
  shouldIgnoreWorkspaceWatchPath: (candidatePath: string) => boolean;
  sendToRenderer: (channel: string, payload?: unknown) => void;
  getGitWatchPaths: (folderPath: string) => Promise<string[]>;
  stopAllLanguageServers: () => void | Promise<void>;
  notifyLanguageServersOfFileChange: (
    folderPath: string,
    filePath: string,
    changeType: "create" | "change" | "delete",
  ) => void;
  invalidateWorkspaceIndex: (folderPath: string) => void;
}

export class FileWatcherManager {
  private activeWatcher: FSWatcher | null = null;
  private folderWatcher: FSWatcher | null = null;
  private gitWatcher: FSWatcher | null = null;
  private activeFileDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private folderDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private gitDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private folderWatchGeneration = 0;

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
    if (!this.folderWatcher) return;
    await this.folderWatcher.close();
    this.folderWatcher = null;
  }

  async closeGitWatcher() {
    if (this.gitDebounceTimer) {
      clearTimeout(this.gitDebounceTimer);
      this.gitDebounceTimer = null;
    }
    if (!this.gitWatcher) return;
    await this.gitWatcher.close();
    this.gitWatcher = null;
  }

  async watchFile(filePath: string) {
    await this.closeActiveWatcher();

    this.activeWatcher = chokidar.watch(filePath, this.buildWatcherOptions());

    this.activeWatcher.on("change", () => {
      if (this.activeFileDebounceTimer) clearTimeout(this.activeFileDebounceTimer);

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
    const generation = ++this.folderWatchGeneration;
    await this.closeFolderWatcher();
    await this.closeGitWatcher();
    // Stopping language servers belongs before the new watcher is installed:
    // diagnostics and file sync from the old workspace should not race with
    // filesystem events from the folder the user just opened.
    await Promise.resolve(this.deps.stopAllLanguageServers());
    if (generation !== this.folderWatchGeneration) return;

    try {
      this.folderWatcher = chokidar.watch(folderPath, {
        ...this.buildWatcherOptions(),
        ignored: this.deps.shouldIgnoreWorkspaceWatchPath,
        depth: 8,
      });

      const notify = (changedPath: string) => {
        if (this.folderDebounceTimer) clearTimeout(this.folderDebounceTimer);
        // The timer is stored on the manager, not as a local closure variable,
        // because workspace switches close the watcher before the last debounce
        // may have fired. closeFolderWatcher can now cancel this pending send
        // and prevent a stale tree refresh for a folder that is no longer open.
        this.folderDebounceTimer = setTimeout(() => {
          this.folderDebounceTimer = null;
          if (generation !== this.folderWatchGeneration) return;
          this.deps.invalidateWorkspaceIndex(folderPath);
          this.deps.sendToRenderer("fs:folderChanged", { path: changedPath });
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
      });
      this.folderWatcher.on("addDir", notify);
      this.folderWatcher.on("unlinkDir", notify);

      const gitWatchPaths = await this.deps.getGitWatchPaths(folderPath);
      if (generation !== this.folderWatchGeneration) return;
      if (gitWatchPaths.length > 0) {
        this.gitWatcher = chokidar.watch(gitWatchPaths, {
          ...this.buildWatcherOptions(),
          // Git watch paths are intentionally narrow (`HEAD`, `index`, `refs`,
          // etc). A shallow depth keeps rebase/fetch updates visible without
          // walking deep object directories on repositories with many refs.
          depth: 2,
        });

        const notifyGit = () => {
          if (this.gitDebounceTimer) clearTimeout(this.gitDebounceTimer);
          // This timer is also instance-owned so closeGitWatcher can cancel it
          // during rapid workspace changes. Otherwise a delayed git:changed
          // event can repaint source-control state for the wrong workspace.
          this.gitDebounceTimer = setTimeout(() => {
            this.gitDebounceTimer = null;
            if (generation !== this.folderWatchGeneration) return;
            this.deps.sendToRenderer("git:changed", { folderPath });
          }, 90);
        };

        this.gitWatcher.on("add", notifyGit);
        this.gitWatcher.on("change", notifyGit);
        this.gitWatcher.on("unlink", notifyGit);
        this.gitWatcher.on("addDir", notifyGit);
        this.gitWatcher.on("unlinkDir", notifyGit);
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
    await this.closeFolderWatcher();
    await this.closeGitWatcher();
  }

  async closeAll() {
    this.folderWatchGeneration += 1;
    await this.closeActiveWatcher();
    await this.closeFolderWatcher();
    await this.closeGitWatcher();
  }
}
