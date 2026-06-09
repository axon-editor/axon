import fs from "fs";
import { ipcMain } from "electron";
import {
  type GitActionResult,
  type GitCommitDiffResult,
  type GitCommitResult,
  type GitHistoryResult,
  type GitStatusResult,
} from "../../shared/git";
import {
  commitGitChanges,
  getGitCommitDiff,
  getGitDiff,
  getGitFileBase,
  getGitHistory,
  getGitStatus,
  runGitAction,
} from "./git";

export function registerGitHandlers() {
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
    ): Promise<GitCommitDiffResult> => {
      if (!folderPath || !fs.existsSync(folderPath)) {
        return {
          hash,
          path: null,
          diff: "",
        };
      }

      return getGitCommitDiff(folderPath, hash, filePath);
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
}
