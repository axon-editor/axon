import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import {
  type GitActionResult,
  type GitChange,
  type GitCommitDiffResult,
  type GitCommitResult,
  type GitDiffResult,
  type GitFileState,
  type GitHistoryCommit,
  type GitHistoryFile,
  type GitHistoryResult,
  type GitStatusResult,
} from "../../shared/git";

const execFileAsync = promisify(execFile);

async function runGit(
  folderPath: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync("git", ["-C", folderPath, ...args], {
    timeout: 30000,
    maxBuffer: 1024 * 1024 * 8,
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function readGitBlob(
  root: string,
  ref: string,
  relativePath: string | null,
) {
  if (!relativePath) return "";

  try {
    const gitObject = ref === ":" ? `:${relativePath}` : `${ref}:${relativePath}`;
    const result = await runGit(root, ["show", gitObject]);
    return result.stdout;
  } catch {
    return "";
  }
}

async function readWorkingTreeFile(root: string, relativePath: string | null) {
  if (!relativePath) return "";

  try {
    return await fs.promises.readFile(path.resolve(root, relativePath), "utf-8");
  } catch {
    return "";
  }
}

function toGitFileState(status: string): GitFileState {
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

function isUsableGitPath(filePath: string) {
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

function normalizeGitRequestPath(root: string, filePath: string) {
  const relativePath = path.isAbsolute(filePath)
    ? path.relative(root, filePath)
    : filePath;

  return isUsableGitPath(relativePath) ? relativePath : null;
}

function parseGitStatus(root: string, statusOutput: string): GitChange[] {
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

function parseGitHistoryFile(root: string, line: string): GitHistoryFile | null {
  const parts = line.split("\t").map((part) => part.trim());
  const statusCode = parts[0] ?? "";
  if (!statusCode) return null;

  const rawStatus = statusCode[0] ?? "";
  const status = toGitFileState(rawStatus);
  const isRenameOrCopy = rawStatus === "R" || rawStatus === "C";
  const oldPath = isRenameOrCopy ? parts[1] ?? null : null;
  const filePath = isRenameOrCopy ? parts[2] ?? "" : parts[1] ?? "";
  if (!isUsableGitPath(filePath)) return null;

  return {
    path: filePath,
    absolutePath: path.resolve(root, filePath),
    oldPath: oldPath && isUsableGitPath(oldPath) ? oldPath : null,
    status,
  };
}

function getGitAuthorAvatarUrl(authorEmail: string) {
  const normalizedEmail = authorEmail.trim().toLowerCase();
  if (!normalizedEmail) return "";

  const githubNoreplyMatch = normalizedEmail.match(
    /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/,
  );
  if (githubNoreplyMatch?.[1]) {
    return `https://github.com/${githubNoreplyMatch[1]}.png?size=96`;
  }

  // Git itself only stores the author email, not a profile image. I derive a
  // public avatar URL in the main process so every renderer window receives a
  // normal image source. I use d=404 instead of an identicon because Axon's Git
  // history should show a real account image when one exists, then let the UI
  // fall back to initials when there is no public avatar.
  const emailHash = crypto
    .createHash("md5")
    .update(normalizedEmail)
    .digest("hex");
  return `https://www.gravatar.com/avatar/${emailHash}?s=96&d=404`;
}

function parseGitHistory(root: string, output: string): GitHistoryCommit[] {
  const commitSeparator = "\x1e";
  const fieldSeparator = "\x1f";

  return output
    .split(commitSeparator)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry): GitHistoryCommit | null => {
      const [metaBlock, filesBlock = ""] = entry.split(/\r?\n\r?\n/, 2);
      const [
        hash,
        shortHash,
        authorName,
        authorEmail,
        date,
        relativeDate,
        subject,
        body,
      ] = metaBlock.split(fieldSeparator);
      if (!hash || !shortHash) return null;

      const files = filesBlock
        .split(/\r?\n/)
        .map((filePath) => parseGitHistoryFile(root, filePath))
        .filter((file): file is GitHistoryFile => file !== null);

      return {
        hash,
        shortHash,
        subject: subject || "(no subject)",
        authorName: authorName || "Unknown",
        authorEmail: authorEmail || "",
        authorAvatarUrl: getGitAuthorAvatarUrl(authorEmail || ""),
        date: date || "",
        relativeDate: relativeDate || "",
        body: body || "",
        files,
      };
    })
    .filter((commit): commit is GitHistoryCommit => commit !== null);
}

export async function getGitStatus(
  folderPath: string,
): Promise<GitStatusResult> {
  try {
    const rootResult = await runGit(folderPath, ["rev-parse", "--show-toplevel"]);
    const root = rootResult.stdout.trim();
    const branchResult = await runGit(folderPath, [
      "branch",
      "--show-current",
    ]);
    const statusResult = await runGit(root, [
      "status",
      "--porcelain=v1",
      "-uall",
    ]);
    const ignoredResult = await runGit(root, [
      "ls-files",
      "--ignored",
      "--exclude-standard",
      "--others",
      "--directory",
    ]);

    return {
      isRepository: true,
      root,
      branch: branchResult.stdout.trim() || "detached",
      changes: parseGitStatus(root, statusResult.stdout),
      ignoredPaths: parseGitIgnoredPaths(root, ignoredResult.stdout),
    };
  } catch {
    return {
      isRepository: false,
      root: null,
      branch: null,
      changes: [],
      ignoredPaths: [],
    };
  }
}

export async function getGitDiff(
  folderPath: string,
  filePath: string,
  staged: boolean,
  untracked: boolean,
): Promise<GitDiffResult> {
  const status = await getGitStatus(folderPath);
  const root = status.root ?? folderPath;
  const relativePath = normalizeGitRequestPath(root, filePath);
  if (!relativePath) {
    return {
      path: "",
      diff: "",
    };
  }

  const readDiff = async (args: string[]) => {
    try {
      const result = await runGit(root, args);
      return result.stdout || result.stderr;
    } catch (err) {
      return `${(err as { stdout?: string }).stdout ?? ""}${(err as { stderr?: string }).stderr ?? ""}`;
    }
  };

  // Git can report the same path as both staged and unstaged. The UI should
  // still show useful context in that case, so I try the requested side first
  // and then fall back to the other side if Git returns an empty diff.
  const diffRequests = untracked
    ? [["diff", "--no-index", "--", "/dev/null", relativePath]]
    : staged
      ? [
          ["diff", "--cached", "--", relativePath],
          ["diff", "--", relativePath],
        ]
      : [
          ["diff", "--", relativePath],
          ["diff", "--cached", "--", relativePath],
        ];

  for (const args of diffRequests) {
    const diff = await readDiff(args);
    if (diff.trim().length > 0) {
      const baseContent = await readGitBlob(root, "HEAD", relativePath);
      const currentContent = untracked
        ? await readWorkingTreeFile(root, relativePath)
        : staged
          ? await readGitBlob(root, ":", relativePath)
          : await readWorkingTreeFile(root, relativePath);

      return {
        path: relativePath,
        diff,
        baseContent,
        currentContent,
      };
    }
  }

  return {
    path: relativePath,
    diff: "",
    baseContent: await readGitBlob(root, "HEAD", relativePath),
    currentContent: await readWorkingTreeFile(root, relativePath),
  };
}

export async function getGitFileBase(
  folderPath: string,
  filePath: string,
): Promise<string> {
  const status = await getGitStatus(folderPath);
  const root = status.root ?? folderPath;
  const relativePath = normalizeGitRequestPath(root, filePath);
  if (!relativePath) return "";

  try {
    const result = await runGit(root, ["show", `HEAD:${relativePath}`]);
    return result.stdout;
  } catch {
    // A new/untracked file has no committed base. Returning an empty original
    // lets the diff editor still show the whole current file as an addition
    // instead of failing the compare flow.
    return "";
  }
}

export async function getGitHistory(
  folderPath: string,
  filePath?: string | null,
): Promise<GitHistoryResult> {
  const status = await getGitStatus(folderPath);
  if (!status.isRepository || !status.root) {
    return {
      isRepository: false,
      root: null,
      branch: null,
      commits: [],
    };
  }

  const args = [
    "log",
    "--date=iso-strict",
    "--name-status",
    "--pretty=format:%x1e%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%ar%x1f%s%x1f%b",
  ];
  const relativePath = filePath
    ? normalizeGitRequestPath(status.root, filePath)
    : null;
  if (filePath && !relativePath) {
    return {
      isRepository: true,
      root: status.root,
      branch: status.branch,
      commits: [],
    };
  }
  if (relativePath) {
    args.push("--", relativePath);
  }

  try {
    // History is read-only, but it still stays in the main process because it
    // depends on the user's Git binary and repository path. Keeping that shell
    // boundary centralized means the renderer can ask for "history for this
    // workspace/file" without learning how to assemble Git arguments safely.
    const result = await runGit(status.root, args);
    return {
      isRepository: true,
      root: status.root,
      branch: status.branch,
      commits: parseGitHistory(status.root, result.stdout),
    };
  } catch {
    return {
      isRepository: true,
      root: status.root,
      branch: status.branch,
      commits: [],
    };
  }
}

export async function getGitCommitDiff(
  folderPath: string,
  hash: string,
  filePath?: string | null,
  oldPath?: string | null,
): Promise<GitCommitDiffResult> {
  const status = await getGitStatus(folderPath);
  if (!status.isRepository || !status.root || !/^[0-9a-f]{7,40}$/i.test(hash)) {
    return {
      hash,
      path: null,
      diff: "",
    };
  }

  try {
    const relativePath = filePath
      ? normalizeGitRequestPath(status.root, filePath)
      : null;
    const relativeOldPath = oldPath
      ? normalizeGitRequestPath(status.root, oldPath)
      : null;
    const args = [
      "show",
      "--format=fuller",
      "--stat",
      "--patch",
      "--find-renames",
      hash,
    ];
    if (relativePath) {
      args.push("--", relativePath);
    }

    // The selected commit owns a list of changed files, but the user usually
    // wants the diff for one file at a time. Filtering here keeps the preview
    // readable and matches editor history views where a commit can be selected
    // first, then one changed path inside that commit can be inspected.
    const result = await runGit(status.root, args);
    const baseContent = await readGitBlob(
      status.root,
      `${hash}^`,
      relativeOldPath ?? relativePath,
    );
    const currentContent = await readGitBlob(status.root, hash, relativePath);
    return {
      hash,
      path: relativePath,
      diff: result.stdout || result.stderr,
      baseContent,
      currentContent,
    };
  } catch (err) {
    return {
      hash,
      path: filePath ?? null,
      diff: `${(err as { stdout?: string }).stdout ?? ""}${(err as { stderr?: string }).stderr ?? ""}`.trim(),
    };
  }
}

export async function runGitAction(
  folderPath: string,
  filePath: string,
  action: "stage" | "unstage" | "discard",
): Promise<GitActionResult> {
  // All Git mutations stay in the main process because the renderer should not
  // gain direct shell or filesystem power. The UI asks for a small, named
  // action, then this function translates that into the safest Git command for
  // the current status of the path.
  const status = await getGitStatus(folderPath);
  if (!status.isRepository || !status.root) {
    return {
      ok: false,
      message: "Current workspace is not a Git repository.",
    };
  }

  const relativePath = normalizeGitRequestPath(status.root, filePath);
  if (!relativePath) {
    return {
      ok: false,
      message: "No valid Git path was selected.",
    };
  }
  const change = status.changes.find(
    (candidate) => candidate.path === relativePath,
  );

  try {
    if (action === "stage") {
      // `git add` is intentionally scoped to one path. That keeps a button
      // click in Source Control from staging unrelated files the user has not
      // reviewed yet.
      await runGit(status.root, ["add", "--", relativePath]);
      return {
        ok: true,
        message: `Staged ${relativePath}.`,
      };
    }

    if (action === "unstage") {
      // `restore --staged` moves the path out of the index without touching
      // the working tree. That is the expected editor behavior: unstage should
      // not discard the user's actual file edits.
      await runGit(status.root, ["restore", "--staged", "--", relativePath]);
      return {
        ok: true,
        message: `Unstaged ${relativePath}.`,
      };
    }

    if (change?.indexState === "untracked") {
      // Untracked files do not have a HEAD version to restore from, so discard
      // must delete them. The renderer confirms before it calls this action;
      // this command still stays path-scoped so it cannot clean the whole repo.
      await runGit(status.root, ["clean", "-f", "--", relativePath]);
      return {
        ok: true,
        message: `Deleted untracked file ${relativePath}.`,
      };
    }

    // For tracked files, discard only resets the working tree copy. If the file
    // also has staged changes, those staged changes remain staged so a user can
    // throw away extra local edits without losing the reviewed index state.
    await runGit(status.root, ["restore", "--worktree", "--", relativePath]);
    return {
      ok: true,
      message: `Discarded unstaged changes in ${relativePath}.`,
    };
  } catch (err) {
    const message = `${(err as { stderr?: string }).stderr ?? ""}${(err as { message?: string }).message ?? ""}`.trim();
    return {
      ok: false,
      message: message || `Failed to ${action} ${relativePath}.`,
    };
  }
}

export async function commitGitChanges(
  folderPath: string,
  message: string,
): Promise<GitCommitResult> {
  const status = await getGitStatus(folderPath);
  if (!status.isRepository || !status.root) {
    return {
      ok: false,
      message: "Current workspace is not a Git repository.",
    };
  }

  const cleanMessage = message.trim();
  if (!cleanMessage) {
    return {
      ok: false,
      message: "Write a commit message before committing.",
    };
  }

  const hasStagedChanges = status.changes.some((change) => change.staged);
  if (!hasStagedChanges) {
    return {
      ok: false,
      message: "Stage at least one file before committing.",
    };
  }

  try {
    // The renderer should never assemble shell commands. A commit message can
    // contain quotes, bullets, and multiple lines, so I pass it through stdin
    // with `git commit -F -`. That keeps the exact message while avoiding
    // shell escaping bugs that would be painful in a desktop editor.
    await new Promise<void>((resolve, reject) => {
      const child = spawn("git", ["commit", "-F", "-"], {
        cwd: status.root ?? folderPath,
        env: process.env,
      });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf-8");
      });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || "Git commit failed."));
      });
      child.stdin.end(`${cleanMessage}\n`);
    });

    return {
      ok: true,
      message: "Committed staged changes.",
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Failed to commit staged changes.",
    };
  }
}

export async function getGitWatchPaths(folderPath: string): Promise<string[]> {
  try {
    const gitDirResult = await runGit(folderPath, ["rev-parse", "--git-dir"]);
    const commonDirResult = await runGit(folderPath, [
      "rev-parse",
      "--git-common-dir",
    ]);
    const status = await getGitStatus(folderPath);
    const root = status.root ?? folderPath;

    const resolveGitPath = (value: string) =>
      path.isAbsolute(value) ? value : path.resolve(root, value);
    const gitDir = resolveGitPath(gitDirResult.stdout.trim());
    const commonDir = resolveGitPath(commonDirResult.stdout.trim());

    return [
      path.join(gitDir, "HEAD"),
      path.join(gitDir, "index"),
      path.join(gitDir, "MERGE_HEAD"),
      path.join(gitDir, "CHERRY_PICK_HEAD"),
      path.join(gitDir, "REBASE_HEAD"),
      path.join(commonDir, "packed-refs"),
      path.join(commonDir, "refs"),
    ].filter((watchPath, index, allPaths) => {
      return fs.existsSync(watchPath) && allPaths.indexOf(watchPath) === index;
    });
  } catch {
    return [];
  }
}
