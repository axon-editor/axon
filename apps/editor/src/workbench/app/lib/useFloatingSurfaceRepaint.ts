/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useEffect } from "react";

// macOS can keep transparent Chromium pixels above its native vibrancy view.
// A React re-render or CSS-only hover then damages only a small rectangle and
// composites that region against a stale snapshot, so the current translucent
// popup sits on top of ghosted earlier frames. An opaque surface would let the
// newest paint cover them, a glass surface does not. The workspace render
// boundary already answers this by pushing the app root through a temporary
// opacity layer that makes Chromium submit the complete surface once. This
// hook runs the identical pulse whenever a floating glass surface repaints,
// so state A to B to C only ever leaves the current frame underneath.
const FLOATING_GLASS_SELECTOR = [
  ".axon-popup-surface",
  ".axon-modal-overlay",
  ".axon-modal-panel",
  ".axon-popover:not(.axon-select-popover)",
  ".axon-context-menu",
  ".axon-line-trace-popover",
].join(",");
const SOLID_GLASS_SELECTOR =
  ".axon-tooltip, .axon-select-popover, .axon-select-control";
const REPAINT_CLASS = "axon-workspace-repaint";
const RESUBMIT_FRAME_DELAY = 2;

function surfaceElement(node: Node | null): Element | null {
  if (!node) return null;
  if (node instanceof Element) return node;
  return node.parentElement;
}

export function isFloatingGlassSurface(node: Node | null): boolean {
  const element = surfaceElement(node);
  if (!element) return false;
  // Tooltips and select controls stay fully opaque in glass mode, so they
  // cannot ghost and do not need the resubmit pulse that translucent surfaces
  // do. The class checks must run before the floating list because tooltips
  // also carry axon-popup-surface.
  if (element.closest(SOLID_GLASS_SELECTOR)) return false;
  return Boolean(element.closest(FLOATING_GLASS_SELECTOR));
}

export function createFloatingSurfaceResubmitter({
  documentElement = document.documentElement,
  requestAnimationFrame = window.requestAnimationFrame.bind(window),
}: {
  documentElement?: HTMLElement;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
} = {}) {
  let cycleInFlight = false;
  let dirtiedDuringCycle = false;
  let flushHandle = 0;

  const request = () => {
    if (!documentElement.classList.contains("axon-native-glass")) return;
    dirtiedDuringCycle = true;
    // A cycle is already re-submitting the surface or a flush is queued for
    // this frame, so the request merges into it instead of stacking pulses.
    if (cycleInFlight || flushHandle) return;
    flushHandle = requestAnimationFrame(() => {
      flushHandle = 0;
      if (!dirtiedDuringCycle) return;
      dirtiedDuringCycle = false;
      cycleInFlight = true;
      documentElement.classList.add(REPAINT_CLASS);
      let frame = 0;
      const release = () => {
        frame += 1;
        if (frame < RESUBMIT_FRAME_DELAY) {
          requestAnimationFrame(release);
          return;
        }
        documentElement.classList.remove(REPAINT_CLASS);
        cycleInFlight = false;
        if (dirtiedDuringCycle) request();
      };
      requestAnimationFrame(release);
    });
  };

  return request;
}

interface InstallResult {
  dispose: () => void;
}

export function installFloatingSurfaceRepaint(): InstallResult {
  const resubmit = createFloatingSurfaceResubmitter();
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (isFloatingGlassSurface(record.target)) {
        resubmit();
        return;
      }
      for (const node of Array.from(record.addedNodes)) {
        if (isFloatingGlassSurface(node)) {
          resubmit();
          return;
        }
      }
      for (const node of Array.from(record.removedNodes)) {
        if (isFloatingGlassSurface(node)) {
          resubmit();
          return;
        }
      }
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "style"],
    characterData: true,
  });

  // CSS-only hover states repaint a translucent surface without mutating the
  // DOM, which the observer alone would miss. Pointer movement over such a
  // surface therefore counts as a repaint; the resubmitter coalesces the
  // flood of pointermove events down to one pulse per frame.
  const handlePointerMove = (event: PointerEvent) => {
    if (isFloatingGlassSurface(event.target as Node | null)) resubmit();
  };
  window.addEventListener("pointermove", handlePointerMove, { passive: true });

  return {
    dispose: () => {
      observer.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
    },
  };
}

// Mounted once at the app shell (outside the workspace render boundary) so the
// observer survives workspace switches. It only pulses while native glass is
// active, so non-glass sessions carry no observer-driven repaint cost.
export function useFloatingSurfaceRepaint(): void {
  useEffect(() => installFloatingSurfaceRepaint().dispose, []);
}