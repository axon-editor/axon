/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

  it("shows the full commit message without truncation", () => {
    const { controller, popover } = createMountedPopover();
    const summary = popover.querySelector<HTMLDivElement>(
      ".axon-line-trace-popover__summary",
    );
    const message =
      "Add the trace popover\n\nShows the full commit message in a " +
      "fixed-height modal that scrolls for long commits.";

    controller.update(
      {
        lineNumber: 4,
        hash: "1234567890abcdef1234567890abcdef12345678",
        shortHash: "12345678",
        authorName: "Gorden Archer",
        authorEmail: "gorden@example.com",
        authorTime: 1720000000,
        summary: "Add the trace popover",
      },
      { "1234567890abcdef1234567890abcdef12345678": message },
    );

    expect(summary?.textContent).toBe(message);

    const hash = popover.querySelector<HTMLSpanElement>(
      ".axon-line-trace-popover__hash",
    );
    const timestampDate = popover.querySelector<HTMLSpanElement>(
      ".axon-line-trace-popover__timestamp-date",
    );
    const timestampTime = popover.querySelector<HTMLSpanElement>(
      ".axon-line-trace-popover__timestamp-time",
    );
    expect(hash?.textContent).toBe("12345678");
    expect(hash?.title).toBe("1234567890abcdef1234567890abcdef12345678");
    expect(timestampDate?.textContent).toMatch(/202[4-6]/);
    expect(timestampTime?.textContent).toMatch(/\d{1,2}:\d{2}/);
    controller.dispose();
  });

  it("keeps the popover open when the pointer moves onto it to scroll", () => {
    vi.useFakeTimers();
    const { anchor, controller, popover } = createMountedPopover();

    anchor.dispatchEvent(
      new MouseEvent("mouseenter", { clientX: 40, clientY: 60 }),
    );
    vi.advanceTimersByTime(2_000);
    expect(popover.dataset.visible).toBe("true");

    anchor.dispatchEvent(
      new MouseEvent("mouseleave", { relatedTarget: popover }),
    );

    expect(popover.dataset.visible).toBe("true");
    controller.dispose();
  });
});
