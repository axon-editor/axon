/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

export function parseCommitMessageBatch(output: string): Map<string, string> {
  const messages = new Map<string, string>();
  const parts = output.split("\0");
  for (let index = 0; index + 1 < parts.length; index += 2) {
    const hash = parts[index].trim();
    const message = parts[index + 1];
    if (!/^[0-9a-f]{40}$/i.test(hash)) continue;
    messages.set(hash.toLowerCase(), message);
  }
  return messages;
}

async function collectCommitMessageBodies(
  root: string,
  lines: GitBlameLine[],
): Promise<Record<string, string>> {
  const messages: Record<string, string> = {};
  const uniqueHashes = [
    ...new Set(
      lines
        .map((line) => line.hash)
        .filter((hash) => /^[0-9a-f]{40}$/i.test(hash)),
    ),
  ];
  if (uniqueHashes.length === 0) return messages;

  try {
    const result = await execFileAsync(
      "git",
      [
        "-C",
        root,
        "show",
        "--no-patch",
        "--format=%H%x00%B%x00",
        ...uniqueHashes,
      ],
      { timeout: 30_000, maxBuffer: 32 * 1024 * 1024 },
    );
    for (const [hash, message] of parseCommitMessageBatch(result.stdout)) {
      const trimmed = message.trim();
      if (trimmed) messages[hash] = trimmed;
    }
  } catch {
    // Commit message bodies are a display enhancement; blame itself is unaffected.
  }
  return messages;
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
      return { path: null, lines: [], messages: {} };
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
    return { path: null, lines: [], messages: {} };
  }

  try {
    const result = await execFileAsync(
      "git",
      ["-C", root, "blame", "--line-porcelain", "--", relativePath],
      { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 },
    );
    const lines = parseGitLinePorcelain(result.stdout);
    const messages = await collectCommitMessageBodies(root, lines);
    return {
      path: path.resolve(root, relativePath),
      lines,
      messages,
    };
  } catch {
    return {
      path: path.resolve(root, relativePath),
      lines: [],
      messages: {},
    };
  }
}
