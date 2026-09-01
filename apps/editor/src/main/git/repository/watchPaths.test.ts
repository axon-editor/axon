import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { getGitWatchPaths } from "./watchPaths";

const repositories: string[] = [];

afterEach(() => {
  for (const repository of repositories.splice(0)) {
    fs.rmSync(repository, { force: true, recursive: true });
  }
});

describe("Git repository watch paths", () => {
  it("resolves parent repository metadata from a nested workspace", async () => {
    const repository = fs.mkdtempSync(
      path.join(os.tmpdir(), "axon-git-watch-paths-"),
    );
    repositories.push(repository);
    execFileSync("git", ["-C", repository, "init"], { stdio: "pipe" });

    const workspace = path.join(repository, "services", "core");
    fs.mkdirSync(workspace, { recursive: true });

    const watchPaths = await getGitWatchPaths(workspace);
    const gitDirectory = fs.realpathSync(path.join(repository, ".git"));

    expect(watchPaths).toContain(path.join(gitDirectory, "HEAD"));
    expect(watchPaths).toContain(path.join(gitDirectory, "index"));
    expect(watchPaths).toContain(path.join(gitDirectory, "refs"));
    expect(
      watchPaths.every((watchPath) => watchPath.startsWith(gitDirectory)),
    ).toBe(true);
  });
});
