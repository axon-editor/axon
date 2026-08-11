import { afterEach, describe, expect, it, vi } from "vitest";
import { createLineTracePopover } from "../../lib/git/lineTracePopover";

function createMountedPopover() {
  const anchor = document.createElement("span");
  document.body.appendChild(anchor);
  const controller = createLineTracePopover(anchor);
  const popover = document.querySelector<HTMLDivElement>(
    ".axon-line-trace-popover",
  );
  if (!popover) throw new Error("Line Trace popover was not mounted.");
  return { anchor, controller, popover };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("Axon Line Trace popover", () => {
  it("does not open after Monaco detaches the hovered widget", () => {
    vi.useFakeTimers();
    const { anchor, controller, popover } = createMountedPopover();

    anchor.dispatchEvent(
      new MouseEvent("mouseenter", { clientX: 40, clientY: 60 }),
    );
    anchor.remove();
    vi.advanceTimersByTime(2_000);

    expect(popover.dataset.visible).toBeUndefined();
    controller.dispose();
  });

  it("dismisses a visible popover when the pointer leaves without mouseleave", () => {
    vi.useFakeTimers();
    const { anchor, controller, popover } = createMountedPopover();

    anchor.dispatchEvent(
      new MouseEvent("mouseenter", { clientX: 40, clientY: 60 }),
    );
    vi.advanceTimersByTime(2_000);
    expect(popover.dataset.visible).toBe("true");

    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 400, clientY: 400 }),
    );

    expect(popover.dataset.visible).toBeUndefined();
    controller.dispose();
  });
});
