import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ipcHandlers = new Map<string, (...args: any[]) => unknown>();
const gitMocks = vi.hoisted(() => ({
  commitGitChanges: vi.fn(),
  getGitCommitDiff: vi.fn(),
  getGitDiff: vi.fn(),
  getGitFileBase: vi.fn(),
  getGitHistory: vi.fn(),
  getGitStatus: vi.fn(),
  listGitBranches: vi.fn(),
  listGitStashes: vi.fn(),
  runGitAction: vi.fn(),
  runGitBranchAction: vi.fn(),
  runGitStashAction: vi.fn(),
}));
const advancedGitMocks = vi.hoisted(() => ({
  getGitGraph: vi.fn(),
  listGitConflicts: vi.fn(),
  listGitWorktrees: vi.fn(),
  resolveGitConflict: vi.fn(),
  runGitWorktreeAction: vi.fn(),
}));

vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: vi.fn(() => null) },
  app: { getPath: vi.fn(() => process.cwd()) },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      ipcHandlers.set(channel, handler);
    }),
  },
}));
vi.mock("./git", () => gitMocks);
vi.mock("./advancedGit", () => advancedGitMocks);
vi.mock("./blame", () => ({ getGitBlame: vi.fn() }));
vi.mock("./clone", () => ({
  cloneGitRepository: vi.fn(),
  validateGitCloneRepositoryUrl: vi.fn(),
}));

import { registerGitHandlers } from "./handlers";

function createDependencies() {
  return {
    authorizeWorkspaceRoot: vi.fn(),
    assertWorkspaceRoot: vi.fn(
      (_rendererId: number, folderPath: string) => folderPath,
    ),
    assertWorkspacePath: vi.fn(
      (_rendererId: number, filePath: string) => filePath,
    ),
  };
}

describe("Git IPC capabilities", () => {
  beforeEach(() => {
    ipcHandlers.clear();
    vi.clearAllMocks();
  });

  it("stops an unauthorized repository request before invoking Git", async () => {
    const dependencies = createDependencies();
    dependencies.assertWorkspaceRoot.mockImplementation(() => {
      throw new Error("workspace not authorized");
    });
    registerGitHandlers(dependencies);

    await expect(
      ipcHandlers.get("git:status")!({ sender: { id: 9 } }, process.cwd()),
    ).rejects.toThrow("workspace not authorized");
    expect(gitMocks.getGitStatus).not.toHaveBeenCalled();
  });

  it("resolves relative Git paths through the workspace capability", async () => {
    const dependencies = createDependencies();
    gitMocks.getGitDiff.mockResolvedValue({ path: "package.json", diff: "" });
    registerGitHandlers(dependencies);
    const root = process.cwd();

    await ipcHandlers.get("git:diff")!(
      { sender: { id: 10 } },
      root,
      "package.json",
      false,
      false,
    );

    expect(dependencies.assertWorkspacePath).toHaveBeenCalledWith(
      10,
      path.join(root, "package.json"),
    );
    expect(gitMocks.getGitDiff).toHaveBeenCalledWith(
      root,
      path.join(root, "package.json"),
      false,
      false,
    );
  });

  it("refuses an add-worktree path that did not come from the native picker", async () => {
    const dependencies = createDependencies();
    registerGitHandlers(dependencies);

    const result = await ipcHandlers.get("git:worktreeAction")!(
      { sender: { id: 11 } },
      process.cwd(),
      { type: "add", path: process.cwd() },
    );

    expect(result).toEqual(
      expect.objectContaining({ ok: false, message: expect.stringContaining("native picker") }),
    );
    expect(advancedGitMocks.runGitWorktreeAction).not.toHaveBeenCalled();
  });
});
