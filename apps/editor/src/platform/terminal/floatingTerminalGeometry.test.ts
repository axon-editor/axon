/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  FLOATING_TERMINAL_MARGIN,
  MIN_FLOATING_TERMINAL_HEIGHT,
  MIN_FLOATING_TERMINAL_WIDTH,
} from "../../../../../apps/editor/src/platform/terminal/terminalProtocol";
import {
  clampFloatingRect,
  getDefaultFloatingRect,
  getFloatingDragPosition,
  type FloatingTerminalViewport,
} from "../../../../../extensions/builtin/terminal/workbench/lib/floatingTerminal";

const desktop: FloatingTerminalViewport = { width: 1440, height: 900 };

describe("getDefaultFloatingRect", () => {
  it("keeps the frame fully inside the window", () => {
    const rect = getDefaultFloatingRect(desktop);

    expect(rect.left).toBeGreaterThanOrEqual(FLOATING_TERMINAL_MARGIN);
    expect(rect.top).toBeGreaterThanOrEqual(FLOATING_TERMINAL_MARGIN);
    expect(rect.left + rect.width).toBeLessThanOrEqual(
      desktop.width - FLOATING_TERMINAL_MARGIN,
    );
    expect(rect.top + rect.height).toBeLessThanOrEqual(
      desktop.height - FLOATING_TERMINAL_MARGIN,
    );
  });

  it("scales to the window instead of overflowing a narrow one", () => {
    const rect = getDefaultFloatingRect({ width: 520, height: 420 });

    expect(rect.width).toBeLessThanOrEqual(520 - FLOATING_TERMINAL_MARGIN * 2);
    expect(rect.height).toBeLessThanOrEqual(420 - FLOATING_TERMINAL_MARGIN * 2);
  });

  it("honors the minimums on a window too small to hold them", () => {
    const rect = getDefaultFloatingRect({ width: 260, height: 200 });

    expect(rect.width).toBe(MIN_FLOATING_TERMINAL_WIDTH);
    expect(rect.height).toBe(MIN_FLOATING_TERMINAL_HEIGHT);
    // Even then the top-left stays grabbable, otherwise the header could not
    // be reached to drag the frame back on screen.
    expect(rect.left).toBe(FLOATING_TERMINAL_MARGIN);
    expect(rect.top).toBe(FLOATING_TERMINAL_MARGIN);
  });
});

describe("clampFloatingRect", () => {
  it("pulls a frame dragged past the right edge back into view", () => {
    const clamped = clampFloatingRect(
      { left: 5000, top: 100, width: 800, height: 400 },
      desktop,
    );

    expect(clamped.left).toBe(
      desktop.width - 800 - FLOATING_TERMINAL_MARGIN,
    );
  });

  it("pulls a frame dragged above the top bar back into view", () => {
    const clamped = clampFloatingRect(
      { left: 100, top: -900, width: 800, height: 400 },
      desktop,
    );

    expect(clamped.top).toBe(FLOATING_TERMINAL_MARGIN);
  });

  it("shrinks an oversized frame instead of leaving it off screen", () => {
    const clamped = clampFloatingRect(
      { left: 0, top: 0, width: 4000, height: 3000 },
      desktop,
    );

    expect(clamped.width).toBe(
      desktop.width - FLOATING_TERMINAL_MARGIN * 2,
    );
    expect(clamped.height).toBe(
      desktop.height - FLOATING_TERMINAL_MARGIN * 2,
    );
  });

  it("leaves a frame that already fits untouched", () => {
    const rect = { left: 300, top: 200, width: 700, height: 400 };

    expect(clampFloatingRect(rect, desktop)).toEqual(rect);
  });
});

describe("getFloatingDragPosition", () => {
  const size = { width: 700, height: 400 };

  it("offsets by the grab point so the header does not jump", () => {
    const position = getFloatingDragPosition(
      { x: 250, y: 150 },
      { x: 50, y: 20 },
      size,
      desktop,
    );

    expect(position).toEqual({ left: 200, top: 130 });
  });

  it("clamps a drag that runs off the bottom right corner", () => {
    const position = getFloatingDragPosition(
      { x: 9999, y: 9999 },
      { x: 50, y: 20 },
      size,
      desktop,
    );

    expect(position.left).toBe(desktop.width - size.width - FLOATING_TERMINAL_MARGIN);
    expect(position.top).toBe(desktop.height - size.height - FLOATING_TERMINAL_MARGIN);
  });

  it("never reports a position outside the frame margin", () => {
    const position = getFloatingDragPosition(
      { x: -500, y: -500 },
      { x: 10, y: 10 },
      size,
      desktop,
    );

    expect(position.left).toBe(FLOATING_TERMINAL_MARGIN);
    expect(position.top).toBe(FLOATING_TERMINAL_MARGIN);
  });
});