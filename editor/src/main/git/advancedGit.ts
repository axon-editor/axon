import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  type GitActionResult,
  type GitConflictFile,
  type GitConflictListResult,
  type GitConflictResolution,
  type GitGraphCommit,
  type GitGraphResult,
  type GitWorktree,
  type GitWorktreeAction,
  type GitWorktreeListResult,
} from "../../shared/git";
import { getGitStatus } from "./git";

const execFileAsync = promisify(execFile);

async function runGit(folderPath: string, args: string[]) {
  const result = await execFileAsync("git", ["-C", folderPath, ...args], {
    timeout: 30000,
    maxBuffer: 1024 * 1024 * 8,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function resolveRepository(folderPath: string) {
  const status = await getGitStatus(folderPath);
  if (!status.isRepository || !status.root) {
    return {
      ok: false,
      message: "Current workspace is not a Git repository.",
      root: null,
      branch: null,
    };
  }

  return {
    ok: true,
    message: "",
    root: status.root,
    branch: status.branch,
  };
}

function normalizeGitPath(root: string, filePath: string) {
  const relativePath = path.isAbsolute(filePath)
    ? path.relative(root, filePath)
    : filePath;
  const normalized = relativePath.replace(/\\/g, "/").trim();

  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.split("/").includes("null")
  ) {
    return null;
  }

  return normalized;
}

function formatGitError(err: unknown, fallback: string) {
  const gitOutput = `${(err as { stdout?: string }).stdout ?? ""}${(err as { stderr?: string }).stderr ?? ""}`.trim();
  if (gitOutput) return gitOutput;
  return err instanceof Error ? err.message : fallback;
}

function parseConflictFiles(root: string, output: string): GitConflictFile[] {
  const byPath = new Map<string, GitConflictFile>();

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const [mode, rawStage, _hash, ...pathParts] = line.split(/\s+/);
    const filePath = pathParts.join(" ");
    const stage =
      rawStage === "1" ? "base" : rawStage === "2" ? "ours" : "theirs";

    if (!mode || !filePath || !["base", "ours", "theirs"].includes(stage)) {
      continue;
    }

    const existing = byPath.get(filePath) ?? {
      path: filePath,
      absolutePath: path.resolve(root, filePath),
      stages: [],
    };
    if (!existing.stages.includes(stage as "base" | "ours" | "theirs")) {
      existing.stages.push(stage as "base" | "ours" | "theirs");
    }
    byPath.set(filePath, existing);
  }

  return Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path));
}

export async function listGitConflicts(
  folderPath: string,
): Promise<GitConflictListResult> {
  const repository = await resolveRepository(folderPath);
  if (!repository.ok || !repository.root) {
    return {
      ok: false,
      message: repository.message,
      conflicts: [],
    };
  }

  try {
    const result = await runGit(repository.root, ["ls-files", "-u"]);
    const conflicts = parseConflictFiles(repository.root, result.stdout);
    return {
      ok: true,
      message:
        conflicts.length === 0
          ? "No merge conflicts."
          : `Found ${conflicts.length} conflicted file${conflicts.length === 1 ? "" : "s"}.`,
      conflicts,
    };
  } catch (err) {
    return {
      ok: false,
      message: formatGitError(err, "Failed to list merge conflicts."),
      conflicts: [],
    };
  }
}

export async function resolveGitConflict(
  folderPath: string,
  resolution: GitConflictResolution,
): Promise<GitActionResult> {
  const repository = await resolveRepository(folderPath);
  if (!repository.ok || !repository.root) {
    return { ok: false, message: repository.message };
  }

  const relativePath = normalizeGitPath(repository.root, resolution.path);
  if (!relativePath) {
    return { ok: false, message: "Choose a valid conflicted file." };
  }

  try {
    if (resolution.type === "ours") {
      await runGit(repository.root, ["checkout", "--ours", "--", relativePath]);
    }
    if (resolution.type === "theirs") {
      await runGit(repository.root, [
        "checkout",
        "--theirs",
        "--",
        relativePath,
      ]);
    }

    // Marking a conflict resolved is always a separate `git add` step because
    // the index is Git's source of truth for merge state. Even when the user
    // picks ours/theirs above, the file remains conflicted until the resolved
    // content is staged; doing that here makes the button behave like a real
    // conflict editor rather than a raw checkout command.
    await runGit(repository.root, ["add", "--", relativePath]);
    return {
      ok: true,
      message: `Marked ${relativePath} resolved.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: formatGitError(err, "Failed to resolve conflict."),
    };
  }
}

function parseGitWorktrees(root: string, output: string): GitWorktree[] {
  return output
    .split(/\r?\n\r?\n/)
    .map((entry): GitWorktree | null => {
      const lines = entry.split(/\r?\n/).map((line) => line.trim());
      const worktreePath = lines
        .find((line) => line.startsWith("worktree "))
        ?.slice("worktree ".length);
      if (!worktreePath) return null;

      const branchRef = lines
        .find((line) => line.startsWith("branch "))
        ?.slice("branch ".length);
      const head = lines.find((line) => line.startsWith("HEAD "))?.slice(5);
      return {
        path: worktreePath,
        branch: branchRef?.replace(/^refs\/heads\//, "") ?? null,
        head: head ?? null,
        detached: lines.includes("detached"),
        bare: lines.includes("bare"),
        current: path.resolve(worktreePath) === path.resolve(root),
      };
    })
    .filter((worktree): worktree is GitWorktree => worktree !== null);
}

export async function listGitWorktrees(
  folderPath: string,
): Promise<GitWorktreeListResult> {
  const repository = await resolveRepository(folderPath);
  if (!repository.ok || !repository.root) {
    return {
      ok: false,
      message: repository.message,
      worktrees: [],
    };
  }

  try {
    const result = await runGit(repository.root, ["worktree", "list", "--porcelain"]);
    return {
      ok: true,
      message: "Loaded worktrees.",
      worktrees: parseGitWorktrees(repository.root, result.stdout),
    };
  } catch (err) {
    return {
      ok: false,
      message: formatGitError(err, "Failed to list worktrees."),
      worktrees: [],
    };
  }
}

function isSafeBranchName(value: string) {
  return (
    value.trim() === value &&
    value.length > 0 &&
    !value.startsWith("-") &&
    !value.includes("..") &&
    !/[~^:?*[\\\s]/.test(value)
  );
}

export async function runGitWorktreeAction(
  folderPath: string,
  action: GitWorktreeAction,
): Promise<GitActionResult> {
  const repository = await resolveRepository(folderPath);
  if (!repository.ok || !repository.root) {
    return { ok: false, message: repository.message };
  }

  try {
    if (action.type === "prune") {
      await runGit(repository.root, ["worktree", "prune"]);
      return { ok: true, message: "Pruned stale worktrees." };
    }

    if (action.type === "remove") {
      const targetPath = path.resolve(action.path);
      if (targetPath === path.resolve(repository.root)) {
        return { ok: false, message: "The active worktree cannot remove itself." };
      }
      await runGit(repository.root, [
        "worktree",
        "remove",
        ...(action.force ? ["--force"] : []),
        targetPath,
      ]);
      return { ok: true, message: `Removed worktree ${targetPath}.` };
    }

    const targetPath = path.resolve(action.path);
    const args = ["worktree", "add"];
    if (action.createBranch?.trim()) {
      if (!isSafeBranchName(action.createBranch.trim())) {
        return { ok: false, message: "Choose a valid branch name." };
      }
      args.push("-b", action.createBranch.trim());
    }
    args.push(targetPath);
    if (action.branch?.trim()) {
      if (!isSafeBranchName(action.branch.trim())) {
        return { ok: false, message: "Choose a valid branch name." };
      }
      args.push(action.branch.trim());
    }

    await runGit(repository.root, args);
    return { ok: true, message: `Added worktree ${targetPath}.` };
  } catch (err) {
    return {
      ok: false,
      message: formatGitError(err, "Git worktree action failed."),
    };
  }
}

function parseRefs(value: string) {
  return value
    .split(",")
    .map((ref) => ref.trim())
    .filter(Boolean);
}

function parseGitGraph(output: string): GitGraphCommit[] {
  const activeLanes: string[] = [];

  return output
    .split(/\r?\n/)
    .map((line): GitGraphCommit | null => {
      const [
        hash,
        shortHash,
        parentBlock,
        refBlock,
        authorName,
        relativeDate,
        subject,
      ] = line.split("\x1f");
      if (!hash || !shortHash) return null;

      let lane = activeLanes.indexOf(hash);
      if (lane === -1) {
        lane = activeLanes.length;
        activeLanes.push(hash);
      }

      const parents = parentBlock ? parentBlock.split(" ").filter(Boolean) : [];
      activeLanes.splice(lane, 1, ...parents);

      return {
        hash,
        shortHash,
        parents,
        refs: parseRefs(refBlock ?? ""),
        subject: subject || "(no subject)",
        authorName: authorName || "Unknown",
        relativeDate: relativeDate || "",
        lane,
      };
    })
    .filter((commit): commit is GitGraphCommit => commit !== null);
}

export async function getGitGraph(folderPath: string): Promise<GitGraphResult> {
  const repository = await resolveRepository(folderPath);
  if (!repository.ok || !repository.root) {
    return {
      ok: false,
      message: repository.message,
      root: null,
      branch: null,
      commits: [],
    };
  }

  try {
    const result = await runGit(repository.root, [
      "log",
      "--all",
      "--date=relative",
      "--max-count=120",
      "--pretty=format:%H%x1f%h%x1f%P%x1f%D%x1f%an%x1f%ar%x1f%s",
    ]);
    return {
      ok: true,
      message: "Loaded commit graph.",
      root: repository.root,
      branch: repository.branch,
      commits: parseGitGraph(result.stdout),
    };
  } catch (err) {
    return {
      ok: false,
      message: formatGitError(err, "Failed to load commit graph."),
      root: repository.root,
      branch: repository.branch,
      commits: [],
    };
  }
}
