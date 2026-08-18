import * as React from "react";
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
import {
  WORKSPACE_REPAINT_CLASS,
  WorkspaceRenderBoundary,
} from "./WorkspaceRenderBoundary";

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

describe("WorkspaceRenderBoundary", () => {
  let container: HTMLDivElement;
  let root: Root;
  let animationFrames: FrameRequestCallback[];
  let mountSequence: number;

  function WorkspaceState() {
    const mountId = React.useRef(++mountSequence);
    return <div data-mount-id={mountId.current} />;
  }

  function render(workspacePath: string | null) {
    act(() => {
      root.render(
        <WorkspaceRenderBoundary workspacePath={workspacePath}>
          <WorkspaceState />
        </WorkspaceRenderBoundary>,
      );
    });
  }

  beforeAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    animationFrames = [];
    mountSequence = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => root.unmount());
    document.documentElement.classList.remove(WORKSPACE_REPAINT_CLASS);
    container.remove();
  });

  it("keeps the first workspace stable without scheduling a repaint", () => {
    render("/workspace/one");

    expect(animationFrames).toHaveLength(0);
    expect(container.firstElementChild?.getAttribute("data-mount-id")).toBe(
      "1",
    );
  });

  it("remounts workspace state and submits one complete repaint pulse", () => {
    render("/workspace/one");
    render("/workspace/two");

    expect(container.firstElementChild?.getAttribute("data-mount-id")).toBe(
      "2",
    );
    expect(
      document.documentElement.classList.contains(WORKSPACE_REPAINT_CLASS),
    ).toBe(true);
    expect(animationFrames).toHaveLength(1);

    act(() => animationFrames[0](0));
    expect(
      document.documentElement.classList.contains(WORKSPACE_REPAINT_CLASS),
    ).toBe(true);
    expect(animationFrames).toHaveLength(2);

    act(() => animationFrames[1](16));
    expect(
      document.documentElement.classList.contains(WORKSPACE_REPAINT_CLASS),
    ).toBe(false);
  });
});
