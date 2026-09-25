/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getShellHistoryCandidates,
  parseShellHistory,
  readShellCommandHistory,
} from "./shellHistory";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axon-history-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("getShellHistoryCandidates", () => {
  it("prefers an explicit HISTFILE and then the shell default", () => {
    expect(
      getShellHistoryCandidates({
        HOME: "/home/dev",
        HISTFILE: "/tmp/custom_history",
        SHELL: "/bin/zsh",
      })[0],
    ).toBe("/tmp/custom_history");
    expect(
      getShellHistoryCandidates({ HOME: "/home/dev", SHELL: "/bin/zsh" })[0],
    ).toBe("/home/dev/.zsh_history");
    expect(
      getShellHistoryCandidates({ HOME: "/home/dev", SHELL: "/usr/bin/bash" })[0],
    ).toBe("/home/dev/.bash_history");
  });

  it("probes every known location when the shell is unknown", () => {
    const candidates = getShellHistoryCandidates({ HOME: "/home/dev" });

    expect(candidates).toContain("/home/dev/.zsh_history");
    expect(candidates).toContain("/home/dev/.bash_history");
    expect(candidates).toContain("/home/dev/.config/fish/fish_history");
  });

  it("does not repeat a HISTFILE that matches a shell default", () => {
    const candidates = getShellHistoryCandidates({
      HOME: "/home/dev",
      HISTFILE: "/home/dev/.zsh_history",
      SHELL: "/bin/zsh",
    });

    expect(
      candidates.filter((path) => path === "/home/dev/.zsh_history"),
    ).toHaveLength(1);
  });
});

describe("parseShellHistory", () => {
  it("unwraps zsh extended history entries", () => {
    const commands = parseShellHistory(
      [": 1766000000:0;git status", ": 1766000060:0;git commit -m 'fix'"].join(
        "\n",
      ),
    );

    expect(commands).toEqual(["git commit -m 'fix'", "git status"]);
  });

  it("skips bash timestamp lines", () => {
    const commands = parseShellHistory(
      ["#1766000000", "npm run build", "#1766000060", "npm test"].join("\n"),
    );

    expect(commands).toEqual(["npm test", "npm run build"]);
  });

  it("unwraps fish command entries and ignores its metadata", () => {
    const commands = parseShellHistory(
      [
        "begin;",
        "  - cmd: git push",
        "  - cmd: origin main",
        "  - cmd: echo done",
        "  paths:",
        "    - /tmp",
        "end;",
      ].join("\n"),
    );

    expect(commands).toEqual(["echo done", "origin main", "git push"]);
  });

  it("returns the most recent occurrence of a repeated command once", () => {
    const commands = parseShellHistory(
      ["git status", "ls -la", "git status"].join("\n"),
    );

    expect(commands).toEqual(["git status", "ls -la"]);
  });

  it("drops the cut-off first line of a clipped tail", () => {
    const commands = parseShellHistory(
      ["tatus", "npm test", "git status"].join("\n"),
      5000,
      { isHeadClipped: true },
    );

    expect(commands).toEqual(["git status", "npm test"]);
  });

  it("honors the command limit and ignores blank lines", () => {
    const commands = parseShellHistory(
      ["one", "", "two", "   ", "three"].join("\n"),
      2,
    );

    expect(commands).toEqual(["three", "two"]);
  });
});

describe("readShellCommandHistory", () => {
  it("returns the newest commands from the first history file that exists", async () => {
    const home = createTemporaryDirectory();
    fs.writeFileSync(
      path.join(home, ".zsh_history"),
      [": 1766000000:0;echo old", ": 1766000060:0;git status"].join("\n"),
    );

    await expect(
      readShellCommandHistory({ env: { HOME: home, SHELL: "/bin/zsh" } }),
    ).resolves.toEqual(["git status", "echo old"]);
  });

  it("reads a bounded tail and never returns a half command", async () => {
    const home = createTemporaryDirectory();
    fs.writeFileSync(
      path.join(home, ".zsh_history"),
      [": 1:0;echo " + "x".repeat(200), ": 2:0;git status"].join("\n"),
    );

    const commands = await readShellCommandHistory({
      env: { HOME: home, SHELL: "/bin/zsh" },
      maxBytes: 64,
    });

    expect(commands).toEqual(["git status"]);
  });

  it("returns nothing instead of failing when no history file exists", async () => {
    const home = createTemporaryDirectory();

    await expect(
      readShellCommandHistory({ env: { HOME: home, SHELL: "/bin/zsh" } }),
    ).resolves.toEqual([]);
  });

  it("falls back to a later candidate when the first one cannot be read", async () => {
    const home = createTemporaryDirectory();
    fs.mkdirSync(path.join(home, ".config", "fish"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".config", "fish", "fish_history"),
      ["begin;", "  - cmd: npm test", "end;"].join("\n"),
    );

    await expect(
      readShellCommandHistory({
        env: {
          HISTFILE: path.join(home, "missing_history"),
          HOME: home,
          SHELL: "/bin/zsh",
        },
      }),
    ).resolves.toEqual(["npm test"]);
  });
});
