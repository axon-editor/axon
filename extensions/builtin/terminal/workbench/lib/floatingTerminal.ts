/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Geometry for the in-app floating terminal. The terminal keeps its xterm, PTY,
// and scrollback while moving between the docked panel and this floating frame,
// so everything here is pure positioning: no session work lives in this file.
import {
  FLOATING_TERMINAL_MARGIN,
  MIN_FLOATING_TERMINAL_HEIGHT,
  MIN_FLOATING_TERMINAL_WIDTH,
} from "@axon-editor/platform/terminal/terminalProtocol";

export interface FloatingTerminalRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FloatingTerminalViewport {
  width: number;
  height: number;
}

/**
 * The first floating frame, sized against the window rather than fixed. A fixed
 * size overflows a narrow window the moment it opens, so the defaults derive
 * from the viewport and then get clamped by clampFloatingRect.
 */
export function getDefaultFloatingRect(
  viewport: FloatingTerminalViewport,
): FloatingTerminalRect {
  const width = Math.max(
    MIN_FLOATING_TERMINAL_WIDTH,
    Math.round(viewport.width * 0.62),
  );
  const height = Math.max(
    MIN_FLOATING_TERMINAL_HEIGHT,
    Math.round(viewport.height * 0.52),
  );
  return clampFloatingRect(
    {
      left: viewport.width - width - FLOATING_TERMINAL_MARGIN * 3,
      top: FLOATING_TERMINAL_MARGIN * 3,
      width,
      height,
    },
    viewport,
  );
}

/**
 * Keeps the whole frame reachable. The width and height are reduced first when
 * the window itself is too small, because clamping a position alone cannot make
 * an oversized frame fit, and the header would still end up off the right edge.
 */
export function clampFloatingRect(
  rect: FloatingTerminalRect,
  viewport: FloatingTerminalViewport,
): FloatingTerminalRect {
  const width = Math.min(
    rect.width,
    Math.max(
      MIN_FLOATING_TERMINAL_WIDTH,
      viewport.width - FLOATING_TERMINAL_MARGIN * 2,
    ),
  );
  const height = Math.min(
    rect.height,
    Math.max(
      MIN_FLOATING_TERMINAL_HEIGHT,
      viewport.height - FLOATING_TERMINAL_MARGIN * 2,
    ),
  );
  const maxLeft = Math.max(
    FLOATING_TERMINAL_MARGIN,
    viewport.width - width - FLOATING_TERMINAL_MARGIN,
  );
  const maxTop = Math.max(
    FLOATING_TERMINAL_MARGIN,
    viewport.height - height - FLOATING_TERMINAL_MARGIN,
  );
  return {
    width,
    height,
    left: Math.min(Math.max(rect.left, FLOATING_TERMINAL_MARGIN), maxLeft),
    top: Math.min(Math.max(rect.top, FLOATING_TERMINAL_MARGIN), maxTop),
  };
}

/**
 * Drag target from the pointer offset captured on grab. The offset is measured
 * from the frame's own top-left so the header does not jump toward the cursor on
 * the first move.
 */
export function getFloatingDragPosition(
  pointer: { x: number; y: number },
  grabOffset: { x: number; y: number },
  size: { width: number; height: number },
  viewport: FloatingTerminalViewport,
): { left: number; top: number } {
  const clamped = clampFloatingRect(
    {
      left: pointer.x - grabOffset.x,
      top: pointer.y - grabOffset.y,
      width: size.width,
      height: size.height,
    },
    viewport,
  );
  return { left: clamped.left, top: clamped.top };
}

/**
 * Transition hook for the docked/floating swap. A React state flip alone cannot
 * animate between two parents, so the frame animates its own inset properties
 * while the same DOM node stays mounted and the xterm inside it never detaches.
 */
export const FLOATING_TRANSITION_MS = 220;
export const FLOATING_TRANSITION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
