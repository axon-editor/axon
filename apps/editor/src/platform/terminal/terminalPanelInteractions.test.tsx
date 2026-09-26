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
import TerminalTabBar from "../../../../../extensions/builtin/terminal/workbench/TerminalTabBar";
import { useZoomedPanelEscape } from "../../../../../extensions/builtin/terminal/workbench/lib/useZoomedPanelEscape";

const reactTestEnvironment = globalThis as unknown as {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};

const TABS = [
  { id: "one", title: "axon" },
  { id: "two", title: "api" },
  { id: "three", title: "web" },
];

function TabBarHarness({
  onSelect = vi.fn(),
  onClose = vi.fn(),
  onReorder = vi.fn(),
}: {
  onSelect?: (id: string) => void;
  onClose?: (id: string) => void;
  onReorder?: (orderedIds: string[]) => void;
}) {
  return (
    <TerminalTabBar
      tabs={TABS}
      activeTabId="two"
      active
      onSelect={onSelect}
      onClose={onClose}
      onReorder={onReorder}
    />
  );
}

// dnd-kit measures drop targets with layout boxes, and jsdom reports every
// element as a zero-sized rect. Giving each tab a real box is what makes the
// collision detection pick the tab the pointer actually moved over.
function stubTabLayout(container: HTMLElement, width = 120): HTMLElement[] {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>('[role="button"]'),
  );
  nodes.forEach((node, index) => {
    node.getBoundingClientRect = () =>
      ({
        bottom: 32,
        height: 32,
        left: index * width,
        right: index * width + width,
        top: 0,
        width,
        x: index * width,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
  });
  return nodes;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function dispatchPointer(
  target: Element,
  type: string,
  clientX: number,
  clientY = 16,
): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      clientX,
      clientY,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    }),
  );
}

describe("TerminalTabBar", () => {
  let container: HTMLDivElement;
  let root: Root;

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
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders every terminal tab with its shell title", async () => {
    await act(async () => {
      root.render(<TabBarHarness />);
    });

    const labels = Array.from(
      container.querySelectorAll<HTMLElement>('[role="button"]'),
    ).map((node) => node.textContent);
    expect(labels).toEqual(["axon", "api", "web"]);
  });

  it("selects a tab on click and closes it without selecting it", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    await act(async () => {
      root.render(<TabBarHarness onSelect={onSelect} onClose={onClose} />);
    });

    const nodes = stubTabLayout(container);
    const closeButton = nodes[0]?.querySelector("button");
    await act(async () => {
      closeButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    expect(onClose).toHaveBeenCalledWith("one");
    expect(onSelect).not.toHaveBeenCalled();

    await act(async () => {
      nodes[2]?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    expect(onSelect).toHaveBeenCalledWith("three");
  });

  it("reports the new order when a tab is dragged onto another", async () => {
    const onReorder = vi.fn();
    await act(async () => {
      root.render(<TabBarHarness onReorder={onReorder} />);
    });
    const nodes = stubTabLayout(container);

    // The sensor only arms after the pointer clears its distance constraint, so
    // a plain click must not be reported as a drag.
    await act(async () => {
      dispatchPointer(nodes[0]!, "pointerdown", 10);
      dispatchPointer(nodes[0]!, "pointermove", 14);
      dispatchPointer(nodes[0]!, "pointerup", 14);
    });
    expect(onReorder).not.toHaveBeenCalled();

    await act(async () => {
      dispatchPointer(nodes[0]!, "pointerdown", 10);
      dispatchPointer(nodes[0]!, "pointermove", 60);
    });
    // dnd-kit measures the drop targets while a drag is active, so the pointer
    // has to sit still for a frame before the collision result is meaningful.
    await act(async () => {
      await nextFrame();
    });
    await act(async () => {
      dispatchPointer(document.body, "pointermove", 260);
    });
    await act(async () => {
      dispatchPointer(document.body, "pointerup", 260);
    });

    expect(onReorder).toHaveBeenCalledWith(["two", "three", "one"]);
  });
});

function EscapeHarness({
  zoomed,
  setZoomed,
  surface = "chrome",
}: {
  zoomed: boolean;
  setZoomed: (value: boolean) => void;
  surface?: "chrome" | "xterm";
}) {
  useZoomedPanelEscape(zoomed, setZoomed);
  return (
    <div>
      {surface === "xterm" ? (
        <div className="xterm">
          <textarea className="xterm-helper-textarea" />
        </div>
      ) : (
        <div className="terminal-header" />
      )}
    </div>
  );
}

describe("useZoomedPanelEscape", () => {
  let container: HTMLDivElement;
  let root: Root;

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
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  function pressEscape(target: Element): KeyboardEvent {
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    target.dispatchEvent(event);
    return event;
  }

  it("restores the panel when a zoomed header sees Escape", async () => {
    const setZoomed = vi.fn();
    await act(async () => {
      root.render(<EscapeHarness zoomed setZoomed={setZoomed} />);
    });

    const event = pressEscape(container.querySelector(".terminal-header")!);
    expect(setZoomed).toHaveBeenCalledWith(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves Escape to a terminal application that has focus", async () => {
    const setZoomed = vi.fn();
    await act(async () => {
      root.render(
        <EscapeHarness zoomed setZoomed={setZoomed} surface="xterm" />,
      );
    });

    const event = pressEscape(container.querySelector("textarea")!);
    expect(setZoomed).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("stays out of the way while the panel is not zoomed", async () => {
    const setZoomed = vi.fn();
    await act(async () => {
      root.render(<EscapeHarness zoomed={false} setZoomed={setZoomed} />);
    });

    pressEscape(container.querySelector(".terminal-header")!);
    expect(setZoomed).not.toHaveBeenCalled();
  });

  it("stops listening once the panel is restored", async () => {
    const setZoomed = vi.fn();
    await act(async () => {
      root.render(<EscapeHarness zoomed setZoomed={setZoomed} />);
    });
    await act(async () => {
      root.render(<EscapeHarness zoomed={false} setZoomed={setZoomed} />);
    });
    pressEscape(container.querySelector(".terminal-header")!);

    expect(setZoomed).not.toHaveBeenCalled();
  });
});
