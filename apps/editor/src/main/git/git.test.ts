import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  getGitDiff,
  getGitStatus,
  isGitBinaryDiff,
  runGitAction,
} from "./git";

const repositories: string[] = [];

function git(repository: string, args: string[]) {
  execFileSync("git", ["-C", repository, ...args], { stdio: "pipe" });
}

function createRepository() {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "axon-git-binary-"));
  repositories.push(repository);
  git(repository, ["init"]);
  git(repository, ["config", "user.name", "Axon Test"]);
  git(repository, ["config", "user.email", "axon@example.com"]);
  return repository;
}

afterEach(() => {
  for (const repository of repositories.splice(0)) {
    fs.rmSync(repository, { force: true, recursive: true });
  }
});

describe("Git binary diffs", () => {
  it("recognizes Git's binary patch markers", () => {
    expect(
      isGitBinaryDiff(
        "diff --git a/data.bin b/data.bin\nBinary files a/data.bin and b/data.bin differ\n",
      ),
    ).toBe(true);
    expect(isGitBinaryDiff("diff --git a/a.ts b/a.ts\n+const a = 1;\n")).toBe(
      false,
    );
  });

  it("returns metadata without decoding XLSX blob contents", async () => {
    const repository = createRepository();
    const filePath = path.join(repository, "budget.xlsx");
    fs.writeFileSync(filePath, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]));
    git(repository, ["add", "budget.xlsx"]);
    git(repository, ["commit", "-m", "add spreadsheet"]);
    fs.writeFileSync(
      filePath,
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01]),
    );

    const result = await getGitDiff(repository, "budget.xlsx", false, false);

    expect(result.binary).toBe(true);
    expect(result.baseContent).toBeUndefined();
    expect(result.currentContent).toBeUndefined();
  }, 15_000);

  it("uses Git detection for binary files with unknown extensions", async () => {
    const repository = createRepository();
    const filePath = path.join(repository, "payload.data");
    fs.writeFileSync(filePath, Buffer.from([0x00, 0x01, 0x02]));
    git(repository, ["add", "payload.data"]);
    git(repository, ["commit", "-m", "add payload"]);
    fs.writeFileSync(filePath, Buffer.from([0x00, 0x03, 0x04, 0x05]));

    const result = await getGitDiff(repository, "payload.data", false, false);

    expect(result.binary).toBe(true);
    expect(result.diff).toContain("Binary files");
    expect(result.baseContent).toBeUndefined();
    expect(result.currentContent).toBeUndefined();
  }, 15_000);
});

describe("nested workspace repositories", () => {
  it(
    "reviews a sibling change from the parent repository root",
    async () => {
      const repository = createRepository();
      const workspace = path.join(repository, "services", "core");
      const siblingFile = path.join(repository, "apps", "editor", "main.ts");
      fs.mkdirSync(workspace, { recursive: true });
      fs.mkdirSync(path.dirname(siblingFile), { recursive: true });
      fs.writeFileSync(siblingFile, "export const value = 1;\n", "utf8");
      git(repository, ["add", "."]);
      git(repository, ["commit", "-m", "add sibling package"]);
      fs.writeFileSync(siblingFile, "export const value = 2;\n", "utf8");

      const status = await getGitStatus(workspace);
      const canonicalRepository = fs.realpathSync(repository);
      const canonicalSiblingFile = fs.realpathSync(siblingFile);
      const change = status.changes.find(
        (candidate) => candidate.absolutePath === canonicalSiblingFile,
      );
      expect(status.root).toBe(canonicalRepository);
      expect(change?.path).toBe("apps/editor/main.ts");

      const diff = await getGitDiff(
        workspace,
        change?.absolutePath ?? "",
        false,
        false,
        status.root,
      );
      expect(diff.path).toBe("apps/editor/main.ts");
      expect(diff.diff).toContain("export const value = 2;");
      expect(diff.currentContent).toBe("export const value = 2;\n");

      const action = await runGitAction(
        workspace,
        canonicalSiblingFile,
        "stage",
        status.root,
      );
      const stagedStatus = await getGitStatus(workspace, status.root);
      expect(action.ok).toBe(true);
      expect(
        stagedStatus.changes.find(
          (candidate) => candidate.path === "apps/editor/main.ts",
        )?.staged,
      ).toBe(true);
    },
    15_000,
  );
});
