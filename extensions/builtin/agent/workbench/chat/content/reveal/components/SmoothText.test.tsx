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
import { REVEAL_INTERVAL_MS } from "../model/revealStep";
import SmoothText from "./SmoothText";

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

describe("SmoothText", () => {
  let container: HTMLDivElement;
  let root: Root;

  function advance(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  beforeAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("shows existing text immediately when the message is not new", () => {
    act(() => {
      root.render(<SmoothText content="Existing answer" />);
    });

    expect(container.textContent).toBe("Existing answer");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reveals new text over ticks", () => {
    const content = "A".repeat(60);

    act(() => {
      root.render(<SmoothText content={content} animateOnMount />);
    });

    expect(container.textContent).toBe("");
    expect(vi.getTimerCount()).toBe(1);

    advance(REVEAL_INTERVAL_MS);
    const partial = container.textContent ?? "";
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBeLessThan(content.length);

    advance(REVEAL_INTERVAL_MS * 10);
    expect(container.textContent).toBe(content);
  });

  it("keeps revealing when the target grows mid-animation", () => {
    const first = "A".repeat(60);

    act(() => {
      root.render(<SmoothText content={first} animateOnMount />);
    });
    advance(REVEAL_INTERVAL_MS);

    const grown = `${first}${"B".repeat(30)}`;
    act(() => {
      root.render(<SmoothText content={grown} animateOnMount />);
    });
    advance(REVEAL_INTERVAL_MS * 20);

    expect(container.textContent).toBe(grown);
  });

  it("snaps when the target is replaced instead of typing backwards", () => {
    act(() => {
      root.render(<SmoothText content="Original answer" />);
    });

    act(() => {
      root.render(<SmoothText content="Replacement" />);
    });

    expect(container.textContent).toBe("Replacement");
    expect(vi.getTimerCount()).toBe(0);
  });
});
