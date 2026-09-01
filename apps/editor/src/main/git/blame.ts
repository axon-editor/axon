import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { type GitBlameLine, type GitBlameResult } from "../../shared/git";
import { resolveGitAuthorIdentity } from "./authorIdentity";

const execFileAsync = promisify(execFile);

export function parseGitLinePorcelain(output: string): GitBlameLine[] {
  const lines: GitBlameLine[] = [];
  const outputLines = output.split(/\r?\n/);
  let current:
    | {
        hash: string;
        lineNumber: number;
        authorName: string;
        authorEmail: string;
        authorTime: number;
        summary: string;
      }
    | undefined;

  for (const line of outputLines) {
    const header = line.match(/^(\^?[0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/i);
    if (header) {
      const hash = header[1].replace(/^\^/, "");
      current = {
        hash,
        lineNumber: Number(header[2]),
        authorName: "Unknown author",
        authorEmail: "",
        authorTime: 0,
        summary: "",
      };
      continue;
    }
    if (!current) continue;

    if (line.startsWith("author ")) {
      current.authorName = line.slice("author ".length).trim();
    } else if (line.startsWith("author-mail ")) {
      current.authorEmail = line
        .slice("author-mail ".length)
        .trim()
        .replace(/^<|>$/g, "");
    } else if (line.startsWith("author-time ")) {
      current.authorTime = Number(line.slice("author-time ".length)) || 0;
    } else if (line.startsWith("summary ")) {
      current.summary = line.slice("summary ".length).trim();
    } else if (line.startsWith("\t")) {
      if (!/^0{40}$/.test(current.hash)) {
        const authorIdentity = resolveGitAuthorIdentity(current.authorEmail);
        lines.push({
          ...current,
          shortHash: current.hash.slice(0, 8),
          authorAvatarUrl: authorIdentity.avatarUrl,
          authorProfileUrl: authorIdentity.profileUrl,
        });
      }
      current = undefined;
    }
  }

  return lines;
}

export async function getGitBlame(
  folderPath: string,
  filePath: string,
  knownRepositoryRoot?: string | null,
): Promise<GitBlameResult> {
  let root: string;
  if (knownRepositoryRoot) {
    root = knownRepositoryRoot;
  } else {
    try {
      const repository = await execFileAsync(
        "git",
        ["-C", folderPath, "rev-parse", "--show-toplevel"],
        { timeout: 5_000, maxBuffer: 1024 * 1024 },
      );
      root = repository.stdout.trim();
    } catch {
      return { path: null, lines: [] };
    }
  }

  const relativePath = path.isAbsolute(filePath)
    ? path.relative(root, filePath)
    : filePath;
  if (
    !relativePath ||
    relativePath === "." ||
    path.isAbsolute(relativePath) ||
    relativePath.split(path.sep).includes("..")
  ) {
    return { path: null, lines: [] };
  }

  try {
    const result = await execFileAsync(
      "git",
      ["-C", root, "blame", "--line-porcelain", "--", relativePath],
      { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 },
    );
    return {
      path: path.resolve(root, relativePath),
      lines: parseGitLinePorcelain(result.stdout),
    };
  } catch {
    return { path: path.resolve(root, relativePath), lines: [] };
  }
}
