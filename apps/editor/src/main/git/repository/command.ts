import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function gitCommandTimeout(args: string[]) {
  // Cheap metadata commands should fail fast. A stuck credential helper or
  // broken repository should not make a settings/status refresh wait behind
  // the same timeout budget as expensive diff/show operations.
  const command = args[0] ?? "";
  if (command === "rev-parse" || command === "branch") return 5000;
  if (command === "status" || command === "ls-files") return 10000;
  return 30000;
}

export async function runGit(
  folderPath: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync("git", ["-C", folderPath, ...args], {
    timeout: gitCommandTimeout(args),
    maxBuffer: 1024 * 1024 * 8,
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export async function findGitRepositoryRoot(folderPath: string) {
  try {
    const result = await runGit(folderPath, ["rev-parse", "--show-toplevel"]);
    const root = result.stdout.trim();
    return root || null;
  } catch {
    return null;
  }
}
