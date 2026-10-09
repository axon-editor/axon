/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it } from "vitest";
import {
  createFloatingSurfaceResubmitter,
  isFloatingGlassSurface,
} from "./useFloatingSurfaceRepaint";

const REPAINT_CLASS = "axon-workspace-repaint";
const GLASS_CLASS = "axon-native-glass";

function createRafQueue() {
  const callbacks: FrameRequestCallback[] = [];
  let nextId = 0;
  return {
    callbacks,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return ++nextId;
    },
    tick: () => {
      const callback = callbacks.shift();
      if (callback) callback(0);
    },
  };
}

afterEach(() => {
  document.documentElement.classList.remove(REPAINT_CLASS, GLASS_CLASS);
});

describe("isFloatingGlassSurface", () => {
  it("recognizes translucent floating surfaces anywhere under their class", () => {
    const appRoot = document.createElement("div");
    appRoot.className = "axon-app-root";
    const popup = document.createElement("div");
    popup.className = "axon-popup-surface";
    const label = document.createElement("span");
    label.textContent = "Buffer symbols";
    popup.appendChild(label);
    appRoot.appendChild(popup);
    document.body.appendChild(appRoot);

    expect(isFloatingGlassSurface(popup)).toBe(true);
    expect(isFloatingGlassSurface(label)).toBe(true);
    expect(isFloatingGlassSurface(label.firstChild)).toBe(true);
    expect(isFloatingGlassSurface(null)).toBe(false);
  });

  it("covers context menus, line traces, and modal panels", () => {
    for (const className of [
      "axon-context-menu",
      "axon-line-trace-popover",
      "axon-modal-panel",
    ]) {
      const surface = document.createElement("div");
      surface.className = className;
      document.body.appendChild(surface);
      expect(isFloatingGlassSurface(surface)).toBe(true);
    }
  });

  it("excludes solid surfaces that cannot ghost", () => {
    const tooltip = document.createElement("div");
    tooltip.className = "axon-popup-surface axon-tooltip";
    const selectPopover = document.createElement("div");
    selectPopover.className = "axon-popover axon-select-popover";
    document.body.appendChild(tooltip);
    document.body.appendChild(selectPopover);

    expect(isFloatingGlassSurface(tooltip)).toBe(false);
    expect(isFloatingGlassSurface(selectPopover)).toBe(false);
  });

  it("ignores ordinary app content that is not a floating surface", () => {
    const editor = document.createElement("div");
    editor.className = "monaco-editor";
    document.body.appendChild(editor);
    expect(isFloatingGlassSurface(editor)).toBe(false);
  });
});

describe("createFloatingSurfaceResubmitter", () => {
  it("stays idle while native glass is off", () => {
    const rafQueue = createRafQueue();
    const resubmit = createFloatingSurfaceResubmitter({
      documentElement: document.documentElement,
      requestAnimationFrame: rafQueue.requestAnimationFrame,
    });

    resubmit();
    resubmit();

    expect(document.documentElement.classList.contains(REPAINT_CLASS)).toBe(
      false,
    );
    expect(rafQueue.callbacks).toHaveLength(0);
  });

  it("pulses the repaint class through one complete and leaves the DOM clean", () => {
    document.documentElement.classList.add(GLASS_CLASS);
    const rafQueue = createRafQueue();
    const resubmit = createFloatingSurfaceResubmitter({
      documentElement: document.documentElement,
      requestAnimationFrame: rafQueue.requestAnimationFrame,
    });

    resubmit();
    expect(rafQueue.callbacks).toHaveLength(1);

    rafQueue.tick();
    expect(
      document.documentElement.classList.contains(REPAINT_CLASS),
    ).toBe(true);

    rafQueue.tick();
    expect(
      document.documentElement.classList.contains(REPAINT_CLASS),
    ).toBe(true);

    rafQueue.tick();
    expect(
      document.documentElement.classList.contains(REPAINT_CLASS),
    ).toBe(false);
  });

  it("coalesces requests made before the flush into one cycle", () => {
    document.documentElement.classList.add(GLASS_CLASS);
    const rafQueue = createRafQueue();
    const resubmit = createFloatingSurfaceResubmitter({
      documentElement: document.documentElement,
      requestAnimationFrame: rafQueue.requestAnimationFrame,
    });

    resubmit();
    resubmit();
    resubmit();
    expect(rafQueue.callbacks).toHaveLength(1);
  });
});