import fs from "fs";
import path from "path";
import { BrowserWindow, app, dialog, ipcMain } from "electron";
import {
  type GitActionResult,
  type GitBranchAction,
  type GitBranchListResult,
  type GitBlameResult,
  type GitCloneResult,
  type GitCloneProgressEvent,
  type GitConflictListResult,
  type GitConflictResolution,
  type GitCommitDiffResult,
  type GitCommitResult,
  type GitGraphResult,
  type GitHistoryResult,
  type GitStashAction,
  type GitStashListResult,
  type GitStatusResult,
  type GitWorktreeAction,
  type GitWorktreeListResult,
} from "../../shared/git";
import { getGitBlame } from "./blame";
import {
  getGitGraph,
  listGitConflicts,
  listGitWorktrees,
  resolveGitConflict,
  runGitWorktreeAction,
} from "./advancedGit";
import {
  commitGitChanges,
  findGitRepositoryRoot,
  listGitBranches,
  listGitStashes,
  getGitCommitDiff,
  getGitDiff,
  getGitFileBase,
  getGitHistory,
  getGitStatus,
  runGitBranchAction,
  runGitStashAction,
  runGitAction,
} from "./git";
import { cloneGitRepository, validateGitCloneRepositoryUrl } from "./clone";

interface GitHandlerDependencies {
  authorizeWorkspaceRoot: (
    rendererId: number,
    rootPath: string,
    persist?: boolean,
  ) => string;
  assertWorkspaceRoot: (rendererId: number, rootPath: string) => string;
  assertGitRepositoryRoot: (
    rendererId: number,
    workspaceRoot: string,
    repositoryRoot: string,
  ) => string;
  assertGitRepositoryPath: (
    rendererId: number,
    workspaceRoot: string,
    repositoryRoot: string,
    candidatePath: string,
  ) => string;
  authorizeReadOnlyFile: (rendererId: number, filePath: string) => string;
}

export function registerGitHandlers(deps: GitHandlerDependencies) {
  const approvedWorktreePathsByRenderer = new Map<number, Set<string>>();
  const repositoryRootsByRenderer = new Map<number, Map<string, string>>();
  const boundSenders = new Set<number>();
  const authorizeRoot = (rendererId: number, folderPath: string) =>
    deps.assertWorkspaceRoot(rendererId, folderPath);

  const bindSenderCleanup = (event: Electron.IpcMainInvokeEvent) => {
    const rendererId = event.sender.id;
    if (boundSenders.has(rendererId)) return;

    boundSenders.add(rendererId);
    event.sender.once("destroyed", () => {
      boundSenders.delete(rendererId);
      approvedWorktreePathsByRenderer.delete(rendererId);
      repositoryRootsByRenderer.delete(rendererId);
    });
  };

  const rememberRepositoryRoot = (
    event: Electron.IpcMainInvokeEvent,
    workspaceRoot: string,
    repositoryRoot: string,
  ) => {
    bindSenderCleanup(event);
    let roots = repositoryRootsByRenderer.get(event.sender.id);
    if (!roots) {
      roots = new Map();
      repositoryRootsByRenderer.set(event.sender.id, roots);
    }
    roots.set(workspaceRoot, repositoryRoot);
  };

  const resolveRepositoryRoot = async (
    event: Electron.IpcMainInvokeEvent,
    folderPath: string,
  ) => {
    const workspaceRoot = authorizeRoot(event.sender.id, folderPath);
    const cachedRoot = repositoryRootsByRenderer
      .get(event.sender.id)
      ?.get(workspaceRoot);
    const discoveredRoot =
      cachedRoot ?? (await findGitRepositoryRoot(workspaceRoot));
    if (!discoveredRoot) {
      throw new Error("Current workspace is not a Git repository.");
    }

    const repositoryRoot = deps.assertGitRepositoryRoot(
      event.sender.id,
      workspaceRoot,
      discoveredRoot,
    );
    rememberRepositoryRoot(event, workspaceRoot, repositoryRoot);
    return { workspaceRoot, repositoryRoot };
  };

  const resolveRepositoryFile = async (
    event: Electron.IpcMainInvokeEvent,
    folderPath: string,
    filePath: string,
  ) => {
    const repository = await resolveRepositoryRoot(event, folderPath);
    const candidatePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(repository.repositoryRoot, filePath);

    return {
      ...repository,
      filePath: deps.assertGitRepositoryPath(
        event.sender.id,
        repository.workspaceRoot,
        repository.repositoryRoot,
        candidatePath,
      ),
    };
  };

  const rememberWorktreePath = (
    event: Electron.IpcMainInvokeEvent,
    value: string,
  ) => {
    const rendererId = event.sender.id;
    bindSenderCleanup(event);
    let approvedPaths = approvedWorktreePathsByRenderer.get(rendererId);
    if (!approvedPaths) {
      approvedPaths = new Set();
      approvedWorktreePathsByRenderer.set(rendererId, approvedPaths);
    }
    approvedPaths.add(fs.realpathSync(value));
  };
  ipcMain.handle(
    "git:clone",
    async (
      event,
      repositoryUrl: unknown,
      requestId: unknown,
    ): Promise<GitCloneResult> => {
      const validated = validateGitCloneRepositoryUrl(repositoryUrl);
      if (!validated.ok) {
        return {
          ok: false,
          canceled: false,
          message: validated.message,
          folderPath: null,
        };
      }

      const cloneRequestId =
        typeof requestId === "string" &&
        requestId.length > 0 &&
        requestId.length <= 128
          ? requestId
          : `${Date.now()}`;
      const sendProgress = (
        progress: Omit<GitCloneProgressEvent, "requestId">,
      ) => {
        if (event.sender.isDestroyed()) return;
        event.sender.send("git:cloneProgress", {
          requestId: cloneRequestId,
          ...progress,
        } satisfies GitCloneProgressEvent);
      };

      const parentWindow = BrowserWindow.fromWebContents(event.sender);
      const dialogOptions = {
        title: "Choose Clone Destination",
        buttonLabel: "Clone Here",
        defaultPath: app.getPath("desktop"),
        properties: ["openDirectory", "createDirectory"] as Array<
          "openDirectory" | "createDirectory"
        >,
      };
      const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);
      if (result.canceled || result.filePaths.length === 0) {
        return {
          ok: false,
          canceled: true,
          message: "Clone canceled.",
          folderPath: null,
        };
      }

      // The native directory dialog is the authority for the write location.
      // The renderer supplies only the repository URL, so it cannot redirect a
      // clone into an arbitrary path that the user did not approve. After Git
      // succeeds, I grant the exact checkout root and no broader parent folder.
      const cloneResult = await cloneGitRepository(
        validated.value,
        result.filePaths[0],
        sendProgress,
      );
      if (cloneResult.ok && cloneResult.folderPath) {
        cloneResult.folderPath = deps.authorizeWorkspaceRoot(
          event.sender.id,
          cloneResult.folderPath,
          true,
        );
        sendProgress({
          phase: "complete",
          percent: 100,
          message: "Clone complete",
        });
      }
      return cloneResult;
    },
  );

  ipcMain.handle("git:status", async (event, folderPath: string) => {
    if (!folderPath || !fs.existsSync(folderPath)) {
      return {
        isRepository: false,
        root: null,
        branch: null,
        changes: [],
        ignoredPaths: [],
      } satisfies GitStatusResult;
    }

    const workspaceRoot = authorizeRoot(event.sender.id, folderPath);
    const status = await getGitStatus(workspaceRoot);
    if (status.root) {
      const repositoryRoot = deps.assertGitRepositoryRoot(
        event.sender.id,
        workspaceRoot,
        status.root,
      );
      rememberRepositoryRoot(event, workspaceRoot, repositoryRoot);
      for (const change of status.changes) {
        // Git status is trusted main-process output, so each exact changed file
        // can receive a read-only grant. This lets the diff modal, media
        // preview, and an explicitly opened editor tab read a sibling package
        // without granting the renderer general access to the parent folder.
        deps.authorizeReadOnlyFile(event.sender.id, change.absolutePath);
      }
    } else {
      repositoryRootsByRenderer.get(event.sender.id)?.delete(workspaceRoot);
    }
    return status;
  });

  ipcMain.handle(
    "git:diff",
    async (
      event,
      folderPath: string,
      filePath: string,
      staged = false,
      untracked = false,
    ) => {
      const repository = await resolveRepositoryFile(
        event,
        folderPath,
        filePath,
      );
      return getGitDiff(
        repository.repositoryRoot,
        repository.filePath,
        staged,
        untracked,
        repository.repositoryRoot,
      );
    },
  );

  ipcMain.handle(
    "git:baseFile",
    async (event, folderPath: string, filePath: string) => {
      if (!folderPath || !filePath || !fs.existsSync(folderPath)) return "";
      const repository = await resolveRepositoryFile(
        event,
        folderPath,
        filePath,
      );
      return getGitFileBase(
        repository.repositoryRoot,
        repository.filePath,
        repository.repositoryRoot,
      );
    },
  );

  ipcMain.handle(
    "git:blame",
    async (
      event,
      folderPath: string,
      filePath: string,
    ): Promise<GitBlameResult> => {
      if (!folderPath || !filePath || !fs.existsSync(folderPath)) {
        return { path: null, lines: [] };
      }
      const repository = await resolveRepositoryFile(
        event,
        folderPath,
        filePath,
      );
      return getGitBlame(
        repository.repositoryRoot,
        repository.filePath,
        repository.repositoryRoot,
      );
    },
  );

  ipcMain.handle(
    "git:history",
    async (
      event,
      folderPath: string,
      filePath?: string | null,
    ): Promise<GitHistoryResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          isRepository: false,
          root: null,
          branch: null,
          commits: [],
        };
      }

      const repository = await resolveRepositoryRoot(event, folderPath);
      const repositoryFile = filePath
        ? await resolveRepositoryFile(event, folderPath, filePath)
        : null;
      return getGitHistory(
        repository.repositoryRoot,
        repositoryFile?.filePath ?? filePath,
        repository.repositoryRoot,
      );
    },
  );

  ipcMain.handle(
    "git:commitDiff",
    async (
      event,
      folderPath: string,
      hash: string,
      filePath?: string | null,
      oldPath?: string | null,
    ): Promise<GitCommitDiffResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          hash,
          path: null,
          diff: "",
          binary: false,
        };
      }

      const repository = await resolveRepositoryRoot(event, folderPath);
      const repositoryFile = filePath
        ? await resolveRepositoryFile(event, folderPath, filePath)
        : null;
      const oldRepositoryFile = oldPath
        ? await resolveRepositoryFile(event, folderPath, oldPath)
        : null;
      return getGitCommitDiff(
        repository.repositoryRoot,
        hash,
        repositoryFile?.filePath ?? filePath,
        oldRepositoryFile?.filePath ?? oldPath,
        repository.repositoryRoot,
      );
    },
  );

  ipcMain.handle(
    "git:action",
    async (
      event,
      folderPath: string,
      filePath: string,
      action: "stage" | "unstage" | "discard",
    ) => {
      if (!folderPath || !filePath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before running Git actions.",
        } satisfies GitActionResult;
      }

      const repository = await resolveRepositoryFile(
        event,
        folderPath,
        filePath,
      );
      return runGitAction(
        repository.repositoryRoot,
        repository.filePath,
        action,
        repository.repositoryRoot,
      );
    },
  );

  ipcMain.handle(
    "git:commit",
    async (
      event,
      folderPath: string,
      message: string,
    ): Promise<GitCommitResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before committing changes.",
        };
      }

      const repository = await resolveRepositoryRoot(event, folderPath);
      return commitGitChanges(
        repository.repositoryRoot,
        message,
        repository.repositoryRoot,
      );
    },
  );

  ipcMain.handle(
    "git:branches",
    async (event, folderPath: string): Promise<GitBranchListResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before listing branches.",
          current: null,
          branches: [],
        };
      }

      return listGitBranches(authorizeRoot(event.sender.id, folderPath));
    },
  );

  ipcMain.handle(
    "git:branchAction",
    async (
      event,
      folderPath: string,
      action: GitBranchAction,
    ): Promise<GitActionResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before changing branches.",
        };
      }

      return runGitBranchAction(
        authorizeRoot(event.sender.id, folderPath),
        action,
      );
    },
  );

  ipcMain.handle(
    "git:stashes",
    async (event, folderPath: string): Promise<GitStashListResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before listing stashes.",
          stashes: [],
        };
      }

      return listGitStashes(authorizeRoot(event.sender.id, folderPath));
    },
  );

  ipcMain.handle(
    "git:stashAction",
    async (
      event,
      folderPath: string,
      action: GitStashAction,
    ): Promise<GitActionResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before changing stashes.",
        };
      }

      return runGitStashAction(
        authorizeRoot(event.sender.id, folderPath),
        action,
      );
    },
  );

  ipcMain.handle(
    "git:conflicts",
    async (event, folderPath: string): Promise<GitConflictListResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before listing conflicts.",
          conflicts: [],
        };
      }

      return listGitConflicts(authorizeRoot(event.sender.id, folderPath));
    },
  );

  ipcMain.handle(
    "git:resolveConflict",
    async (
      event,
      folderPath: string,
      resolution: GitConflictResolution,
    ): Promise<GitActionResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before resolving conflicts.",
        };
      }

      const repository = await resolveRepositoryFile(
        event,
        folderPath,
        resolution.path,
      );
      return resolveGitConflict(repository.repositoryRoot, {
        ...resolution,
        path: repository.filePath,
      });
    },
  );

  ipcMain.handle(
    "git:worktrees",
    async (event, folderPath: string): Promise<GitWorktreeListResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before listing worktrees.",
          worktrees: [],
        };
      }

      return listGitWorktrees(authorizeRoot(event.sender.id, folderPath));
    },
  );

  ipcMain.handle(
    "git:selectWorktreePath",
    async (event, folderPath: string): Promise<string | null> => {
      const root = authorizeRoot(event.sender.id, folderPath);
      const parentWindow = BrowserWindow.fromWebContents(event.sender);
      const options = {
        title: "Choose Worktree Directory",
        buttonLabel: "Use for Worktree",
        defaultPath: path.dirname(root),
        properties: ["openDirectory", "createDirectory"] as Array<
          "openDirectory" | "createDirectory"
        >,
      };
      const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || result.filePaths.length === 0) return null;

      // A worktree commonly lives beside the active repository, so it cannot
      // use the normal inside-workspace path rule. The native picker grants
      // this exact directory to this renderer and the action consumes only a
      // path that was selected through that trusted surface.
      const selectedPath = fs.realpathSync(result.filePaths[0]);
      rememberWorktreePath(event, selectedPath);
      return selectedPath;
    },
  );

  ipcMain.handle(
    "git:worktreeAction",
    async (
      event,
      folderPath: string,
      action: GitWorktreeAction,
    ): Promise<GitActionResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before changing worktrees.",
        };
      }

      const root = authorizeRoot(event.sender.id, folderPath);
      if (action.type === "add") {
        const targetPath = fs.realpathSync(action.path);
        const approvedPaths = approvedWorktreePathsByRenderer.get(
          event.sender.id,
        );
        if (!approvedPaths?.delete(targetPath)) {
          return {
            ok: false,
            message:
              "Choose the worktree directory with the native picker first.",
          };
        }
        return runGitWorktreeAction(root, { ...action, path: targetPath });
      }

      if (action.type === "remove") {
        const targetPath = path.resolve(action.path);
        const worktrees = await listGitWorktrees(root);
        const registeredTarget = worktrees.worktrees.find(
          (worktree) => path.resolve(worktree.path) === targetPath,
        );
        if (!registeredTarget) {
          return {
            ok: false,
            message:
              "Git does not recognize that path as a repository worktree.",
          };
        }
        return runGitWorktreeAction(root, {
          ...action,
          path: registeredTarget.path,
        });
      }

      return runGitWorktreeAction(root, action);
    },
  );

  ipcMain.handle(
    "git:graph",
    async (event, folderPath: string): Promise<GitGraphResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before loading history graph.",
          root: null,
          branch: null,
          commits: [],
        };
      }

      return getGitGraph(authorizeRoot(event.sender.id, folderPath));
    },
  );
}
