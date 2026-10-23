/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { act, useState } from "react";
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
import CommandModal from "./CommandModal";

const reactTestEnvironment = globalThis as unknown as {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};

const performanceMarks = vi.hoisted(() => ({
  markAxonPerformance: vi.fn(),
  measureAxonPerformance: vi.fn(),
}));

vi.mock("../../lib/perf/performanceMarks", () => performanceMarks);

const CLOSE_DELAY_MS = 170;

function Harness({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <CommandModal title={title} onClose={onClose}>
      <div>body</div>
    </CommandModal>
  );
}

function overlay(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(".axon-modal-overlay");
}

describe("CommandModal", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    performanceMarks.markAxonPerformance.mockReset();
    performanceMarks.measureAxonPerformance.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  async function render(props: { title: string; onClose: () => void }) {
    await act(async () => {
      root.render(<Harness {...props} />);
    });
  }

  async function clickOutside() {
    await act(async () => {
      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
    });
  }

  it("closes after the leave animation delay", async () => {
    const onClose = vi.fn();
    await render({ title: "open folder", onClose });

    await clickOutside();
    expect(overlay()).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(CLOSE_DELAY_MS);
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("still closes when the title changes during the leave animation", async () => {
    const onClose = vi.fn();
    await render({ title: "open folder", onClose });

    await clickOutside();

    // The listener effect depends on the title, so a title change mid-close
    // tears that effect down and runs its cleanup. The cleanup owns the pending
    // close timer, which means the modal can be stranded mounted and invisible
    // with no way to dismiss it.
    await render({ title: "open recent", onClose });

    await act(async () => {
      vi.advanceTimersByTime(CLOSE_DELAY_MS * 4);
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes once even when the modal re-renders during the leave animation", async () => {
    const onClose = vi.fn();

    function RerenderingHarness() {
      const [count, setCount] = useState(0);
      return (
        <CommandModal title={`open folder ${count}`} onClose={onClose}>
          <button onClick={() => setCount(count + 1)}>rerender</button>
        </CommandModal>
      );
    }

    await act(async () => {
      root.render(<RerenderingHarness />);
    });
    await clickOutside();
    await act(async () => {
      root.render(<RerenderingHarness />);
    });
    await act(async () => {
      vi.advanceTimersByTime(CLOSE_DELAY_MS * 4);
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("moves the panel when the title bar is dragged", async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <CommandModal title="drag me" onClose={onClose}>
          <div>body</div>
        </CommandModal>,
      );
    });

    const panel = document.querySelector<HTMLElement>(".axon-modal-panel");
    const handle = document.querySelector<HTMLElement>(
      "[data-modal-drag-handle]",
    );
    expect(panel).not.toBeNull();
    expect(handle).not.toBeNull();
    if (!panel || !handle) return;

    panel.getBoundingClientRect = () =>
      ({
        x: 100,
        y: 100,
        left: 100,
        top: 100,
        width: 400,
        height: 300,
        right: 500,
        bottom: 400,
        toJSON: () => ({}),
      }) as DOMRect;

    await act(async () => {
      handle.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 150,
          clientY: 120,
        }),
      );
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          clientX: 200,
          clientY: 170,
        }),
      );
      window.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, cancelable: true }),
      );
    });

    expect(panel.style.transform).toBe("translate3d(50px, 50px, 0)");
  });

  it("only renders the resize handle when a resizable id is given", async () => {
    await act(async () => {
      root.render(
        <CommandModal title="extensions" onClose={vi.fn()} resizable="cm-test">
          <div>body</div>
        </CommandModal>,
      );
    });
    expect(document.querySelector('[aria-label="Resize modal"]')).not.toBeNull();

    await act(async () => {
      root.render(
        <CommandModal title="extensions" onClose={vi.fn()}>
          <div>body</div>
        </CommandModal>,
      );
    });
    expect(document.querySelector('[aria-label="Resize modal"]')).toBeNull();
  });

  it("keeps the modal open when Escape is pressed on the resize handle", async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <CommandModal title="diff" onClose={onClose} resizable="cm-escape-test">
          <div>body</div>
        </CommandModal>,
      );
    });

    const handle = document.querySelector('[aria-label="Resize modal"]');
    expect(handle).not.toBeNull();

    await act(async () => {
      handle?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
      vi.advanceTimersByTime(CLOSE_DELAY_MS * 4);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector(".axon-modal-overlay")).not.toBeNull();
  });
});
