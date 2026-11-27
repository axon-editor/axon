/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from "path";
import {
  type GitChange,
  type GitFileState,
  type GitStatusResult,
} from "../../../../shared/workspace/git";
import { findGitRepositoryRoot, runGit } from "../../repository/command";

export function toGitFileState(status: string): GitFileState {
  switch (status) {
    case "M":
      return "modified";
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "?":
      return "untracked";
    case "!":
      return "ignored";
    default:
      return "unknown";
  }
}

export function isUsableGitPath(filePath: string) {
  const normalizedPath = filePath.replace(/\\/g, "/").trim();
  if (!normalizedPath || normalizedPath === "." || normalizedPath === "null") {
    return false;
  }

  // Some renderer flows can briefly hold placeholder paths while panes or
  // source-control selections are being replaced. Passing those values through
  // to Git produces noisy messages like "Could not access 'src/types/null'",
  // which looks like a repository problem even though the user did not choose
  // that path. The main process is the final shell boundary, so it rejects that
  // placeholder segment before any Git command is spawned.
  return !normalizedPath.split("/").includes("null");
}

function parseGitStatus(root: string, statusOutput: string): GitChange[] {
  if (statusOutput.includes("\0")) {
    const records = statusOutput.split("\0").filter((line) => line.length > 0);
    const changes: GitChange[] = [];

    for (let index = 0; index < records.length; index += 1) {
      const line = records[index] ?? "";
      const indexCode = line[0] ?? " ";
      const worktreeCode = line[1] ?? " ";
      const filePath = line.slice(3);
      const isRenameOrCopy = [indexCode, worktreeCode].some(
        (code) => code === "R" || code === "C",
      );
      const oldPath = isRenameOrCopy ? (records[index + 1] ?? null) : null;

      if (isRenameOrCopy) {
        index += 1;
      }

      if (!isUsableGitPath(filePath)) continue;

      changes.push({
        path: filePath,
        absolutePath: path.resolve(root, filePath),
        oldPath,
        indexState: toGitFileState(indexCode),
        worktreeState: toGitFileState(worktreeCode),
        staged: indexCode !== " " && indexCode !== "?",
        unstaged: worktreeCode !== " " || indexCode === "?",
      });
    }

    return changes;
  }

  return statusOutput
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line): GitChange | null => {
      const indexCode = line[0] ?? " ";
      const worktreeCode = line[1] ?? " ";
      const rawPath = line.slice(3);
      const isRenameOrCopy = [indexCode, worktreeCode].some(
        (code) => code === "R" || code === "C",
      );
      const renameSeparatorIndex = isRenameOrCopy
        ? rawPath.lastIndexOf(" -> ")
        : -1;
      const oldPath =
        renameSeparatorIndex >= 0
          ? rawPath.slice(0, renameSeparatorIndex)
          : null;
      const filePath =
        renameSeparatorIndex >= 0
          ? rawPath.slice(renameSeparatorIndex + " -> ".length)
          : rawPath;

      if (!isUsableGitPath(filePath)) return null;

      return {
        path: filePath,
        absolutePath: path.resolve(root, filePath),
        oldPath,
        indexState: toGitFileState(indexCode),
        worktreeState: toGitFileState(worktreeCode),
        staged: indexCode !== " " && indexCode !== "?",
        unstaged: worktreeCode !== " " || indexCode === "?",
      };
    })
    .filter((change): change is GitChange => change !== null);
}

function parseGitIgnoredPaths(root: string, ignoredOutput: string): string[] {
  return ignoredOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((ignoredPath) => path.resolve(root, ignoredPath.replace(/\/$/, "")));
}

export async function getGitStatus(
  folderPath: string,
  knownRepositoryRoot?: string | null,
): Promise<GitStatusResult> {
  const root =
    knownRepositoryRoot ?? (await findGitRepositoryRoot(folderPath));
  if (!root) {
    return {
      isRepository: false,
      root: null,
      branch: null,
      changes: [],
      ignoredPaths: [],
    };
  }

  const readStatus = async (): Promise<GitStatusResult> => {
    const [branchResult, statusResult, ignoredResult] = await Promise.all([
      runGit(root, ["branch", "--show-current"]),
      runGit(root, [
        "status",
        "--porcelain=v1",
        // I use NUL-delimited output here because Git quotes paths with spaces in
        // normal porcelain output. The sidebar decoration map compares absolute
        // file-tree paths, so a quoted status path like `"Screenshot 2026.png"`
        // will never match the real file path and media files look unchanged.
        "-z",
        "-uall",
      ]),
      runGit(root, [
        "ls-files",
        "--ignored",
        "--exclude-standard",
        "--others",
        "--directory",
      ]),
    ]);

    return {
      isRepository: true,
      root,
      branch: branchResult.stdout.trim() || "detached",
      changes: parseGitStatus(root, statusResult.stdout),
      ignoredPaths: parseGitIgnoredPaths(root, ignoredResult.stdout),
    };
  };

  try {
    return await readStatus();
  } catch {
    // A timeout or an index-lock race is not the same thing as opening a
    // folder that has no repository. Retrying once absorbs the common race;
    // the fallback keeps the repository identity so every Git surface does not
    // disappear just because one status scan failed.
    try {
      return await readStatus();
    } catch {
      let branch = "detached";
      try {
        branch =
          (await runGit(root, ["branch", "--show-current"])).stdout.trim() ||
          "detached";
      } catch {
        // Keep the neutral branch label when Git cannot answer at all.
      }
      return {
        isRepository: true,
        root,
        branch,
        changes: [],
        ignoredPaths: [],
        degraded: true,
      };
    }
  }
}
