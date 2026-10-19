/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
} from "vitest";
import { WorkspaceRenderBoundary } from "./WorkspaceRenderBoundary";

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

describe("WorkspaceRenderBoundary", () => {
  let container: HTMLDivElement;
  let root: Root;
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
    mountSequence = 0;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps the first workspace stable", () => {
    render("/workspace/one");

    expect(container.firstElementChild?.getAttribute("data-mount-id")).toBe(
      "1",
    );
  });

  it("remounts workspace state when the workspace changes", () => {
    render("/workspace/one");
    render("/workspace/two");

    expect(container.firstElementChild?.getAttribute("data-mount-id")).toBe(
      "2",
    );
  });

  it("keeps workspace state across rerenders of the same workspace", () => {
    render("/workspace/one");
    render("/workspace/one");

    expect(container.firstElementChild?.getAttribute("data-mount-id")).toBe(
      "1",
    );
  });
});
