import { describe, expect, it } from "vitest";
import {
  createWorkspaceRoot,
  resolveWorkspaceRootsForFolderOpen,
} from "./workspaceRoots";

describe("folder workspace roots", () => {
  it("creates one root when Open Folder replaces the current workspace", () => {
    expect(
      resolveWorkspaceRootsForFolderOpen({
        path: "/projects/next",
        restoredRoots: [],
        trusted: true,
      }),
    ).toEqual([
      {
        id: "/projects/next",
        path: "/projects/next",
        name: "next",
        trusted: true,
      },
    ]);
  });

  it("preserves all roots while restoring a multi-root session", () => {
    const restoredRoots = [
      createWorkspaceRoot("/projects/api", true),
      createWorkspaceRoot("/projects/web", false),
    ];

    expect(
      resolveWorkspaceRootsForFolderOpen({
        path: "/projects/web",
        restoredRoots,
        trusted: true,
      }),
    ).toEqual([
      createWorkspaceRoot("/projects/api", true),
      createWorkspaceRoot("/projects/web", true),
    ]);
  });
});
