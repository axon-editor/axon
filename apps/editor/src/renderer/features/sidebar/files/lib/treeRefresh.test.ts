import { describe, expect, it } from "vitest";

import {
  shouldReloadFolderNode,
  shouldReloadWorkspaceRoot,
} from "./treeRefresh";

describe("targeted file-tree refresh", () => {
  it("reloads the root only for direct structural children", () => {
    expect(
      shouldReloadWorkspaceRoot("/workspace", {
        path: "/workspace/new.ts",
        kind: "create",
      }),
    ).toBe(true);
    expect(
      shouldReloadWorkspaceRoot("/workspace", {
        path: "/workspace/src/deep/new.ts",
        kind: "create",
      }),
    ).toBe(false);
  });

  it("reloads only the direct parent of a deep agent-created file", () => {
    const event = {
      path: "/workspace/src/generated/client.ts",
      kind: "create" as const,
    };

    expect(shouldReloadFolderNode("/workspace/src/generated", event)).toBe(
      true,
    );
    expect(shouldReloadFolderNode("/workspace/src", event)).toBe(false);
    expect(shouldReloadFolderNode("/workspace/test", event)).toBe(false);
  });

  it("does not reload tree folders for normal content writes", () => {
    const event = {
      path: "/workspace/src/main.ts",
      kind: "change" as const,
    };

    expect(shouldReloadWorkspaceRoot("/workspace", event)).toBe(false);
    expect(shouldReloadFolderNode("/workspace/src", event)).toBe(false);
  });

  it("handles Windows separators with the same parent rules", () => {
    expect(
      shouldReloadFolderNode("C:\\workspace\\src", {
        path: "C:\\workspace\\src\\agent.ts",
        kind: "unknown",
      }),
    ).toBe(true);
  });
});
