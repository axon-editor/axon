import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import FolderPickerLocal from "./FolderPickerLocal";

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

describe("FolderPickerLocal", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onSelect = vi.fn();
  const onSelectWorkspaceRoot = vi.fn();

  beforeAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  beforeEach(() => {
    onSelect.mockReset();
    onSelectWorkspaceRoot.mockReset();
    Object.defineProperty(window, "axon", {
      configurable: true,
      value: { platform: "darwin" },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps the active folder visible in recent history", () => {
    act(() => {
      root.render(
        <FolderPickerLocal
          activeRootId="/projects/axon"
          focusRecent={false}
          openWorkspaceFolders={[
            {
              path: "/projects/axon",
              name: "axon",
              rendererId: 7,
              currentWindow: true,
            },
          ]}
          recentFolders={["/projects/axon", "/projects/zed"]}
          workspaceRoots={[
            {
              id: "/projects/axon",
              path: "/projects/axon",
              name: "axon",
              trusted: true,
            },
          ]}
          onBrowse={vi.fn()}
          onClearRecent={vi.fn()}
          onClearSession={vi.fn()}
          onFocusWorkspaceWindow={vi.fn()}
          onRemoveRecent={vi.fn()}
          onSelect={onSelect}
          onSelectWorkspaceRoot={onSelectWorkspaceRoot}
        />,
      );
    });

    expect(container.textContent).toContain("2 recent");
    expect(container.textContent).toContain("active");
    expect(container.textContent).toContain("zed");

    const activeRecentButton = [...container.querySelectorAll("button")].find(
      (button) =>
        button.textContent?.includes("axon") &&
        button.textContent.includes("active"),
    );
    expect(activeRecentButton).toBeDefined();

    act(() => activeRecentButton?.click());
    expect(onSelectWorkspaceRoot).toHaveBeenCalledWith("/projects/axon");
    expect(onSelect).not.toHaveBeenCalled();
  });
});
