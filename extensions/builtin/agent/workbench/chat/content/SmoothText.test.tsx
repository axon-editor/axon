/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
import SmoothText from "./SmoothText";

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

describe("SmoothText", () => {
  let container: HTMLDivElement;
  let root: Root;
  let frameCallbacks: Map<number, FrameRequestCallback>;
  let nextFrameId: number;

  function runNextFrame() {
    const next = frameCallbacks.entries().next();
    if (next.done) return;

    const [id, callback] = next.value;
    frameCallbacks.delete(id);
    callback(performance.now());
  }

  function runFrames(count: number) {
    for (let frame = 0; frame < count; frame += 1) {
      act(() => runNextFrame());
    }
  }

  beforeAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  beforeEach(() => {
    frameCallbacks = new Map();
    nextFrameId = 1;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      frameCallbacks.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frameCallbacks.delete(id);
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("shows existing text immediately when the message is not new", () => {
    act(() => {
      root.render(<SmoothText content="Existing answer" />);
    });

    expect(container.textContent).toBe("Existing answer");
    expect(frameCallbacks.size).toBe(0);
  });

  it("reveals new text over frames", () => {
    act(() => {
      root.render(<SmoothText content="Hello" animateOnMount />);
    });

    expect(container.textContent).toBe("");
    expect(frameCallbacks.size).toBe(1);

    runFrames(1);
    expect(container.textContent).toBe("Hell");

    runFrames(1);
    expect(container.textContent).toBe("Hello");
  });

  it("keeps revealing when the target grows mid-animation", () => {
    act(() => {
      root.render(<SmoothText content="Hello" animateOnMount />);
    });
    runFrames(1);

    act(() => {
      root.render(<SmoothText content="Hello world" animateOnMount />);
    });
    runFrames(3);

    expect(container.textContent).toBe("Hello world");
  });

  it("snaps when the target is replaced instead of typing backwards", () => {
    act(() => {
      root.render(<SmoothText content="Original answer" />);
    });

    act(() => {
      root.render(<SmoothText content="Replacement" />);
    });

    expect(container.textContent).toBe("Replacement");
    expect(frameCallbacks.size).toBe(0);
  });
});
