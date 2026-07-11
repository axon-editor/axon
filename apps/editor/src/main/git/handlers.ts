import fs from "fs";
import { BrowserWindow, app, dialog, ipcMain } from "electron";
import {
  type GitActionResult,
  type GitBranchAction,
  type GitBranchListResult,
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
import {
  getGitGraph,
  listGitConflicts,
  listGitWorktrees,
  resolveGitConflict,
  runGitWorktreeAction,
} from "./advancedGit";
import {
  commitGitChanges,
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
import {
  cloneGitRepository,
  validateGitCloneRepositoryUrl,
} from "./clone";

interface GitHandlerDependencies {
  authorizeWorkspaceRoot: (
    rendererId: number,
    rootPath: string,
    persist?: boolean,
  ) => string;
}

export function registerGitHandlers(deps: GitHandlerDependencies) {
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

  ipcMain.handle("git:status", async (_event, folderPath: string) => {
    if (!folderPath || !fs.existsSync(folderPath)) {
      return {
        isRepository: false,
        root: null,
        branch: null,
        changes: [],
        ignoredPaths: [],
      } satisfies GitStatusResult;
    }

    return getGitStatus(folderPath);
  });

  ipcMain.handle(
    "git:diff",
    async (
      _event,
      folderPath: string,
      filePath: string,
      staged = false,
      untracked = false,
    ) => {
      return getGitDiff(folderPath, filePath, staged, untracked);
    },
  );

  ipcMain.handle(
    "git:baseFile",
    async (_event, folderPath: string, filePath: string) => {
      if (!folderPath || !filePath || !fs.existsSync(folderPath)) return "";
      return getGitFileBase(folderPath, filePath);
    },
  );

  ipcMain.handle(
    "git:history",
    async (
      _event,
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

      return getGitHistory(folderPath, filePath);
    },
  );

  ipcMain.handle(
    "git:commitDiff",
    async (
      _event,
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
        };
      }

      return getGitCommitDiff(folderPath, hash, filePath, oldPath);
    },
  );

  ipcMain.handle(
    "git:action",
    async (
      _event,
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

      return runGitAction(folderPath, filePath, action);
    },
  );

  ipcMain.handle(
    "git:commit",
    async (
      _event,
      folderPath: string,
      message: string,
    ): Promise<GitCommitResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before committing changes.",
        };
      }

      return commitGitChanges(folderPath, message);
    },
  );

  ipcMain.handle(
    "git:branches",
    async (_event, folderPath: string): Promise<GitBranchListResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before listing branches.",
          current: null,
          branches: [],
        };
      }

      return listGitBranches(folderPath);
    },
  );

  ipcMain.handle(
    "git:branchAction",
    async (
      _event,
      folderPath: string,
      action: GitBranchAction,
    ): Promise<GitActionResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before changing branches.",
        };
      }

      return runGitBranchAction(folderPath, action);
    },
  );

  ipcMain.handle(
    "git:stashes",
    async (_event, folderPath: string): Promise<GitStashListResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before listing stashes.",
          stashes: [],
        };
      }

      return listGitStashes(folderPath);
    },
  );

  ipcMain.handle(
    "git:stashAction",
    async (
      _event,
      folderPath: string,
      action: GitStashAction,
    ): Promise<GitActionResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before changing stashes.",
        };
      }

      return runGitStashAction(folderPath, action);
    },
  );

  ipcMain.handle(
    "git:conflicts",
    async (_event, folderPath: string): Promise<GitConflictListResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before listing conflicts.",
          conflicts: [],
        };
      }

      return listGitConflicts(folderPath);
    },
  );

  ipcMain.handle(
    "git:resolveConflict",
    async (
      _event,
      folderPath: string,
      resolution: GitConflictResolution,
    ): Promise<GitActionResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before resolving conflicts.",
        };
      }

      return resolveGitConflict(folderPath, resolution);
    },
  );

  ipcMain.handle(
    "git:worktrees",
    async (_event, folderPath: string): Promise<GitWorktreeListResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before listing worktrees.",
          worktrees: [],
        };
      }

      return listGitWorktrees(folderPath);
    },
  );

  ipcMain.handle(
    "git:worktreeAction",
    async (
      _event,
      folderPath: string,
      action: GitWorktreeAction,
    ): Promise<GitActionResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before changing worktrees.",
        };
      }

      return runGitWorktreeAction(folderPath, action);
    },
  );

  ipcMain.handle(
    "git:graph",
    async (_event, folderPath: string): Promise<GitGraphResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          ok: false,
          message: "Open a Git workspace before loading history graph.",
          root: null,
          branch: null,
          commits: [],
        };
      }

      return getGitGraph(folderPath);
    },
  );
}
