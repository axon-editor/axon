import { describe, expect, it } from "vitest";
import { activatePane } from "../../lib/layout/paneActivation";
import { type Layout } from "../../lib/layout/types";

function createLayout(): Layout {
  return {
    panes: [
      {
        id: "pane-one",
        openTabs: ["README.md"],
        activeFile: "README.md",
        dirtyFiles: {},
        pinnedTabs: [],
      },
      {
        id: "pane-two",
        openTabs: ["src/index.ts"],
        activeFile: "src/index.ts",
        dirtyFiles: {},
        pinnedTabs: [],
      },
    ],
    activePaneId: "pane-one",
    splitDirection: "horizontal",
  };
}

describe("activatePane", () => {
  it("preserves layout identity when the active pane receives another click", () => {
    const layout = createLayout();

    expect(activatePane(layout, "pane-one")).toBe(layout);
  });

  it("activates an existing sibling without changing its pane state", () => {
    const layout = createLayout();
    const nextLayout = activatePane(layout, "pane-two");

    expect(nextLayout).not.toBe(layout);
    expect(nextLayout.activePaneId).toBe("pane-two");
    expect(nextLayout.panes).toBe(layout.panes);
  });

  it("ignores stale pane IDs after the layout changes", () => {
    const layout = createLayout();

    expect(activatePane(layout, "removed-pane")).toBe(layout);
  });
});
