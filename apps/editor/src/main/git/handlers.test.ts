import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ipcHandlers = new Map<string, (...args: any[]) => unknown>();
const gitMocks = vi.hoisted(() => ({
  commitGitChanges: vi.fn(),
  findGitRepositoryRoot: vi.fn(),
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
    assertGitRepositoryRoot: vi.fn(
      (_rendererId: number, _workspaceRoot: string, repositoryRoot: string) =>
        repositoryRoot,
    ),
    assertGitRepositoryPath: vi.fn(
      (
        _rendererId: number,
        _workspaceRoot: string,
        _repositoryRoot: string,
        filePath: string,
      ) => filePath,
    ),
    authorizeReadOnlyFile: vi.fn(
      (_rendererId: number, filePath: string) => filePath,
    ),
  };
}

function createEvent(rendererId: number) {
  return {
    sender: {
      id: rendererId,
      once: vi.fn(),
    },
  };
}

describe("Git IPC capabilities", () => {
  beforeEach(() => {
    ipcHandlers.clear();
    vi.clearAllMocks();
    gitMocks.findGitRepositoryRoot.mockResolvedValue(process.cwd());
  });

  it("stops an unauthorized repository request before invoking Git", async () => {
    const dependencies = createDependencies();
    dependencies.assertWorkspaceRoot.mockImplementation(() => {
      throw new Error("workspace not authorized");
    });
    registerGitHandlers(dependencies);

    await expect(
      ipcHandlers.get("git:status")!(createEvent(9), process.cwd()),
    ).rejects.toThrow("workspace not authorized");
    expect(gitMocks.getGitStatus).not.toHaveBeenCalled();
  });

  it("resolves repository-relative paths against a parent Git root", async () => {
    const dependencies = createDependencies();
    gitMocks.getGitDiff.mockResolvedValue({
      path: "apps/editor/package.json",
      diff: "",
    });
    registerGitHandlers(dependencies);
    const repositoryRoot = path.resolve(process.cwd(), "..", "..");
    const workspaceRoot = path.join(repositoryRoot, "services", "core");
    const changedPath = "apps/editor/package.json";
    gitMocks.findGitRepositoryRoot.mockResolvedValue(repositoryRoot);

    await ipcHandlers.get("git:diff")!(
      createEvent(10),
      workspaceRoot,
      changedPath,
      false,
      false,
    );

    expect(dependencies.assertGitRepositoryRoot).toHaveBeenCalledWith(
      10,
      workspaceRoot,
      repositoryRoot,
    );
    expect(dependencies.assertGitRepositoryPath).toHaveBeenCalledWith(
      10,
      workspaceRoot,
      repositoryRoot,
      path.join(repositoryRoot, changedPath),
    );
    expect(gitMocks.getGitDiff).toHaveBeenCalledWith(
      repositoryRoot,
      path.join(repositoryRoot, changedPath),
      false,
      false,
      repositoryRoot,
    );
  });

  it("grants exact changed files read-only access without approving the parent folder", async () => {
    const dependencies = createDependencies();
    const repositoryRoot = path.resolve(process.cwd(), "..", "..");
    const workspaceRoot = path.join(repositoryRoot, "services", "core");
    const changedFile = path.join(repositoryRoot, "apps", "editor", "main.ts");
    gitMocks.getGitStatus.mockResolvedValue({
      isRepository: true,
      root: repositoryRoot,
      branch: "main",
      changes: [
        {
          path: "apps/editor/main.ts",
          absolutePath: changedFile,
          oldPath: null,
          indexState: "modified",
          worktreeState: "modified",
          staged: false,
          unstaged: true,
        },
      ],
      ignoredPaths: [],
    });
    registerGitHandlers(dependencies);

    await ipcHandlers.get("git:status")!(createEvent(12), workspaceRoot);

    expect(dependencies.authorizeReadOnlyFile).toHaveBeenCalledWith(
      12,
      changedFile,
    );
    expect(dependencies.authorizeWorkspaceRoot).not.toHaveBeenCalledWith(
      12,
      repositoryRoot,
      expect.anything(),
    );
  });

  it("refuses an add-worktree path that did not come from the native picker", async () => {
    const dependencies = createDependencies();
    registerGitHandlers(dependencies);

    const result = await ipcHandlers.get("git:worktreeAction")!(
      createEvent(11),
      process.cwd(),
      { type: "add", path: process.cwd() },
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        message: expect.stringContaining("native picker"),
      }),
    );
    expect(advancedGitMocks.runGitWorktreeAction).not.toHaveBeenCalled();
  });
});
