import fs from "fs";
import path from "path";
import { findGitRepositoryRoot, runGit } from "./command";

export async function getGitWatchPaths(folderPath: string): Promise<string[]> {
  try {
    const root = await findGitRepositoryRoot(folderPath);
    if (!root) return [];

    // Once the root is known, I run both path queries from that root. Git may
    // return paths relative to the directory supplied through `-C`; resolving
    // a nested workspace's `../../.git` against the repository root would point
    // outside the repository and silently leave Source Control unwatched.
    // This also avoids a full status and ignored-files scan during watcher setup.
    const [gitDirResult, commonDirResult] = await Promise.all([
      runGit(root, ["rev-parse", "--git-dir"]),
      runGit(root, ["rev-parse", "--git-common-dir"]),
    ]);

    const resolveGitPath = (value: string) =>
      path.isAbsolute(value) ? value : path.resolve(root, value);
    const gitDir = resolveGitPath(gitDirResult.stdout.trim());
    const commonDir = resolveGitPath(commonDirResult.stdout.trim());

    const watchPaths = [
      path.join(gitDir, "HEAD"),
      path.join(gitDir, "index"),
      path.join(gitDir, "MERGE_HEAD"),
      path.join(gitDir, "CHERRY_PICK_HEAD"),
      path.join(gitDir, "REBASE_HEAD"),
      path.join(commonDir, "packed-refs"),
      path.join(commonDir, "refs"),
    ];

    return watchPaths.filter((watchPath, index, allPaths) => {
      const parentPath = path.dirname(watchPath);
      // Some Git state files are created only while an operation is active.
      // Filtering them by current existence makes the watcher stale exactly
      // when merge, rebase, cherry-pick, or packed-ref state changes later.
      // Keeping paths whose parent exists lets chokidar report future `add`
      // events while still avoiding impossible watch roots from broken repos.
      return fs.existsSync(parentPath) && allPaths.indexOf(watchPath) === index;
    });
  } catch {
    return [];
  }
}
