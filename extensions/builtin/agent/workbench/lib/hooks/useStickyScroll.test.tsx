/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { act, useRef } from "react";
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
import { useStickyScroll } from "./useStickyScroll";

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

function Harness({
  content,
  resetKey,
}: {
  content: string;
  resetKey: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { pinToBottom } = useStickyScroll({
    scrollRef,
    contentVersion: content,
    resetKey,
  });

  return (
    <div>
      <div ref={scrollRef} data-testid="scroll">
        <div>{content}</div>
      </div>
      <button type="button" onClick={pinToBottom}>
        pin
      </button>
    </div>
  );
}

describe("useStickyScroll", () => {
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

  // jsdom reports every element as zero-height, so the test owns the scroll
  // geometry. The custom scrollTop keeps the value the hook writes instead of
  // letting jsdom clamp it against the fake viewport.
  function prepareScrollElement() {
    const element = container.querySelector<HTMLDivElement>(
      "[data-testid='scroll']",
    );
    if (!element) throw new Error("scroll element not found");

    let scrollTop = 0;
    Object.defineProperty(element, "scrollHeight", {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(element, "clientHeight", {
      configurable: true,
      value: 100,
    });
    Object.defineProperty(element, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });

    return {
      scrollTo(value: number) {
        scrollTop = value;
        element.dispatchEvent(new Event("scroll"));
      },
      get scrollTop() {
        return scrollTop;
      },
    };
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

  it("follows new content while pinned", () => {
    act(() => {
      root.render(<Harness content="one" resetKey="a" />);
    });
    const scroll = prepareScrollElement();
    scroll.scrollTo(100);
    runFrames(1);

    expect(scroll.scrollTop).toBe(200);

    act(() => {
      root.render(<Harness content="one two" resetKey="a" />);
    });
    runFrames(1);

    expect(scroll.scrollTop).toBe(200);
  });

  it("stops following after the user scrolls up", () => {
    act(() => {
      root.render(<Harness content="one" resetKey="a" />);
    });
    const scroll = prepareScrollElement();
    runFrames(1);

    scroll.scrollTo(10);

    act(() => {
      root.render(<Harness content="one two" resetKey="a" />);
    });
    runFrames(1);

    expect(scroll.scrollTop).toBe(10);
  });

  it("re-pins when the conversation changes", () => {
    act(() => {
      root.render(<Harness content="one" resetKey="a" />);
    });
    const scroll = prepareScrollElement();
    runFrames(1);

    scroll.scrollTo(10);

    act(() => {
      root.render(<Harness content="two" resetKey="b" />);
    });
    runFrames(1);

    expect(scroll.scrollTop).toBe(200);
  });

  it("re-pins when the user pins the bottom explicitly", () => {
    act(() => {
      root.render(<Harness content="one" resetKey="a" />);
    });
    const scroll = prepareScrollElement();
    runFrames(1);

    scroll.scrollTo(10);

    act(() => {
      container.querySelector("button")?.click();
    });
    runFrames(1);

    expect(scroll.scrollTop).toBe(200);
  });
});
