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
        stabilityThreshold: 100,
        pollInterval: 50,
      },
      // macOS kqueue watchers are fast, but on a large workspace they can chew
      // through the process file-descriptor limit. Polling is less elegant, but
      // it keeps Axon stable under the repo sizes we actually run here.
      usePolling: this.deps.shouldPollWatchers,
      interval: 250,
      binaryInterval: 400,
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
        const content = fs.readFileSync(filePath, "utf-8");
        // The file watcher can still fire during reload/close. Sending through
        // the shared renderer helper keeps external disk changes useful while
        // avoiding Electron's "Object has been destroyed" crash path.
        this.deps.sendToRenderer("fs:fileChanged", {
          path: filePath,
          content,
        });
      }, 150);
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

    const notify = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.deps.sendToRenderer("fs:folderChanged");
      }, 300);
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
        }, 250);
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
