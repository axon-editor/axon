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
import {
  PanelResizeHandle,
  useResizablePanel,
  type ResizableHandleProps,
} from "./useResizablePanel";

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const STORAGE_PREFIX = "axon.resizable-modal.v1.";
const ID = "resizable-panel-test";
// jsdom reports a 1024x768 viewport, and the hook reserves the overlay padding
// (32px horizontally, 48px vertically) on top of the minimums.
const MAX_WIDTH = 992;
const MAX_HEIGHT = 720;

let latestHandleProps: ResizableHandleProps | null = null;

function Harness({ id }: { id?: string }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const api = useResizablePanel(panelRef, id);
  latestHandleProps = api.handleProps;
  return (
    <div ref={panelRef} data-testid="panel" style={api.style}>
      <PanelResizeHandle {...api.handleProps} />
    </div>
  );
}

function panel(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[data-testid="panel"]');
  if (!found) throw new Error("panel not rendered");
  return found;
}

function handle(): HTMLElement {
  const found = document.querySelector<HTMLElement>(
    '[aria-label="Resize modal"]',
  );
  if (!found) throw new Error("resize handle not rendered");
  return found;
}

function mockPanelSize(width: number, height: number) {
  const element = panel();
  element.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => "",
    }) as DOMRect;
}

function dispatch(
  target: EventTarget,
  type: string,
  init: MouseEventInit & KeyboardEventInit = {},
) {
  const event = type.startsWith("key")
    ? new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init })
    : new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
}

describe("useResizablePanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  beforeEach(() => {
    window.localStorage.clear();
    latestHandleProps = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  async function render() {
    await act(async () => root.render(<Harness id={ID} />));
  }

  it("leaves the responsive defaults alone until something is dragged", async () => {
    await render();

    expect(panel().style.width).toBe("");
    expect(window.localStorage.getItem(STORAGE_PREFIX + ID)).toBeNull();
  });

  it("restores a stored size clamped to the viewport", async () => {
    window.localStorage.setItem(
      STORAGE_PREFIX + ID,
      JSON.stringify({ width: 5000, height: 5000 }),
    );

    await render();

    expect(panel().style.width).toBe(`${MAX_WIDTH}px`);
    expect(panel().style.height).toBe(`${MAX_HEIGHT}px`);
  });

  it("ignores corrupt stored sizes", async () => {
    window.localStorage.setItem(STORAGE_PREFIX + ID, "not json");

    await render();

    expect(panel().style.width).toBe("");
  });

  it("drags the panel and persists the size on release", async () => {
    await render();
    mockPanelSize(800, 600);

    await act(async () => {
      dispatch(handle(), "pointerdown", { clientX: 0, clientY: 0 });
    });
    await act(async () => {
      dispatch(window, "pointermove", { clientX: 120, clientY: 60 });
    });

    expect(panel().style.width).toBe("920px");
    expect(panel().style.height).toBe("660px");
    expect(window.localStorage.getItem(STORAGE_PREFIX + ID)).toBeNull();

    await act(async () => {
      dispatch(window, "pointerup", {});
    });

    expect(
      window.localStorage.getItem(STORAGE_PREFIX + ID),
    ).toContain('"width":920');
  });

  it("clamps a drag to the viewport instead of following the pointer", async () => {
    await render();
    mockPanelSize(800, 600);

    await act(async () => {
      dispatch(handle(), "pointerdown", { clientX: 0, clientY: 0 });
    });
    await act(async () => {
      dispatch(window, "pointermove", { clientX: 100_000, clientY: 100_000 });
    });
    await act(async () => {
      dispatch(window, "pointerup", {});
    });

    expect(panel().style.width).toBe(`${MAX_WIDTH}px`);
    expect(panel().style.height).toBe(`${MAX_HEIGHT}px`);
  });

  it("resets to the responsive default on double-click", async () => {
    window.localStorage.setItem(
      STORAGE_PREFIX + ID,
      JSON.stringify({ width: 900, height: 700 }),
    );
    await render();

    expect(panel().style.width).toBe("900px");

    await act(async () => {
      dispatch(handle(), "dblclick");
    });

    expect(panel().style.width).toBe("");
    expect(window.localStorage.getItem(STORAGE_PREFIX + ID)).toBeNull();
  });

  it("resizes with the arrow keys and persists the result", async () => {
    await render();
    mockPanelSize(800, 600);

    await act(async () => {
      dispatch(handle(), "keydown", { key: "ArrowRight" });
    });

    expect(panel().style.width).toBe("832px");

    await act(async () => {
      dispatch(handle(), "keydown", { key: "ArrowDown" });
    });

    expect(panel().style.height).toBe("632px");
    expect(
      window.localStorage.getItem(STORAGE_PREFIX + ID),
    ).toContain('"height":632');
  });

  it("stops Escape on the handle from reaching document listeners", async () => {
    window.localStorage.setItem(
      STORAGE_PREFIX + ID,
      JSON.stringify({ width: 900, height: 700 }),
    );
    await render();

    const documentListener = vi.fn();
    document.addEventListener("keydown", documentListener);

    await act(async () => {
      dispatch(handle(), "keydown", { key: "Escape" });
    });

    expect(documentListener).not.toHaveBeenCalled();
    expect(panel().style.width).toBe("");
    expect(window.localStorage.getItem(STORAGE_PREFIX + ID)).toBeNull();

    document.removeEventListener("keydown", documentListener);
  });

  it("does not register behavior when no id is given", async () => {
    await act(async () => root.render(<Harness />));
    mockPanelSize(800, 600);

    await act(async () => {
      dispatch(handle(), "pointerdown", { clientX: 0, clientY: 0 });
    });
    await act(async () => {
      dispatch(window, "pointermove", { clientX: 120, clientY: 0 });
    });
    await act(async () => {
      dispatch(window, "pointerup", {});
    });

    expect(latestHandleProps).not.toBeNull();
    expect(panel().style.width).toBe("");
    expect(window.localStorage.length).toBe(0);
  });
});
