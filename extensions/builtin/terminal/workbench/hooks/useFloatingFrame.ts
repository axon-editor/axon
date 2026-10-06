/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Geometry and pointer interaction for the floating terminal modal: entering
// and leaving float, header drag, the eight resize grips, and the window
// clamp that keeps the frame reachable after the Axon window shrinks. The
// pure math lives in ../lib/floatingTerminal; this hook is the React wiring
// around it, extracted from Terminal so the panel component stays about panel
// state instead of pointer bookkeeping.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import { FLOATING_TERMINAL_MARGIN } from "@axon-editor/platform/terminal/terminalProtocol";
import {
  FLOATING_TRANSITION_EASING,
  FLOATING_TRANSITION_MS,
  clampFloatingRect,
  getDefaultFloatingRect,
  getFloatingDragPosition,
  getFloatingResizeRect,
  type FloatingResizeEdge,
  type FloatingTerminalRect,
} from "../lib/floatingTerminal";

// The grips live inside the frame's border because the floating frame clips
// its overflow: anything hanging past the rounded edge would render outside the
// clip and never receive a pointer. Edges stop short of the corners (16px inset
// against 12px corner grips) so the diagonal handles own the pointer where the
// two zones would otherwise meet, instead of relying on DOM order to break the
// tie.
const FLOATING_RESIZE_HANDLES: readonly {
  edge: FloatingResizeEdge;
  cursor: string;
  className: string;
}[] = [
  { edge: "n", cursor: "ns-resize", className: "top-0 left-4 right-4 h-2" },
  { edge: "s", cursor: "ns-resize", className: "bottom-0 left-4 right-4 h-2" },
  { edge: "e", cursor: "ew-resize", className: "top-4 bottom-4 right-0 w-2" },
  { edge: "w", cursor: "ew-resize", className: "top-4 bottom-4 left-0 w-2" },
  { edge: "ne", cursor: "nesw-resize", className: "top-0 right-0 h-3 w-3" },
  { edge: "nw", cursor: "nwse-resize", className: "top-0 left-0 h-3 w-3" },
  { edge: "se", cursor: "nwse-resize", className: "bottom-0 right-0 h-3 w-3" },
  { edge: "sw", cursor: "nesw-resize", className: "bottom-0 left-0 h-3 w-3" },
];

export function useFloatingFrame({
  floating,
  setFloating,
  setZoomed,
}: {
  floating: boolean;
  setFloating: Dispatch<SetStateAction<boolean>>;
  setZoomed: Dispatch<SetStateAction<boolean>>;
}) {
  const [floatingRect, setFloatingRect] = useState<FloatingTerminalRect | null>(
    null,
  );
  const [floatingDragging, setFloatingDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const terminalFrameRef = useRef<HTMLDivElement>(null);
  const [floatingAnimating, setFloatingAnimating] = useState(false);
  const [floatingTransitionRect, setFloatingTransitionRect] =
    useState<FloatingTerminalRect | null>(null);

  const handleDockToggle = useCallback(() => {
    setFloating(false);
  }, [setFloating]);

  const handleFloatingToggle = useCallback(() => {
    if (floating) {
      setFloating(false);
      setFloatingAnimating(false);
      setFloatingTransitionRect(null);
      return;
    }
    setZoomed(false);

    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const target = getDefaultFloatingRect(viewport);
    const frame = terminalFrameRef.current;
    let start: FloatingTerminalRect | null = null;
    if (frame) {
      const rect = frame.getBoundingClientRect();
      start = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
    } else {
      const fallback = target;
      start = {
        left: Math.max(
          FLOATING_TERMINAL_MARGIN,
          (viewport.width - fallback.width) / 2,
        ),
        top: Math.max(
          FLOATING_TERMINAL_MARGIN,
          (viewport.height - fallback.height) / 2,
        ),
        width: fallback.width,
        height: fallback.height,
      };
    }

    setFloatingTransitionRect(start);
    setFloatingAnimating(true);
    // Wait two frames so the browser renders the starting position before
    // switching to the target. Otherwise it computes layout once and flips
    // instantly, skipping the transition entirely.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFloatingRect(target);
        setFloating(true);
      });
    });

    window.setTimeout(() => {
      setFloatingTransitionRect(null);
      setFloatingAnimating(false);
    }, FLOATING_TRANSITION_MS + 16);
  }, [floating, setFloating, setZoomed]);

  const handleDragStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!floatingRect) return;
      dragOffsetRef.current = {
        x: event.clientX - floatingRect.left,
        y: event.clientY - floatingRect.top,
      };
      setFloatingDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [floatingRect],
  );

  const handleDragMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!floatingDragging || !floatingRect) return;
      const { left, top } = getFloatingDragPosition(
        { x: event.clientX, y: event.clientY },
        dragOffsetRef.current,
        { width: floatingRect.width, height: floatingRect.height },
        { width: window.innerWidth, height: window.innerHeight },
      );
      setFloatingRect((currentRect) =>
        currentRect ? { ...currentRect, left, top } : currentRect,
      );
    },
    [floatingDragging, floatingRect],
  );

  const handleDragEnd = useCallback(() => {
    if (!floatingDragging) return;
    setFloatingDragging(false);
  }, [floatingDragging]);

  const handleFloatingResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!floatingRect) return;

      // The edge travels on the element instead of closing over it so all
      // eight grips share this one listener. The delta is measured against the
      // rect captured on grab, so a resize never drifts when state updates
      // lag behind the pointer.
      const edge = event.currentTarget.dataset.edge as
        | FloatingResizeEdge
        | undefined;
      if (!edge) return;
      const handle = FLOATING_RESIZE_HANDLES.find(
        (entry) => entry.edge === edge,
      );

      const startX = event.clientX;
      const startY = event.clientY;
      const startRect = floatingRect;
      event.currentTarget.setPointerCapture(event.pointerId);
      // The pointer can wander over editor content mid-drag, so the body cursor
      // has to carry the gesture; the handle's own cursor only applies while it
      // is still underneath.
      document.body.style.cursor = handle?.cursor ?? "default";
      document.body.style.userSelect = "none";

      const handlePointerMove = (moveEvent: PointerEvent) => {
        setFloatingRect(
          getFloatingResizeRect(
            startRect,
            { x: moveEvent.clientX - startX, y: moveEvent.clientY - startY },
            edge,
            { width: window.innerWidth, height: window.innerHeight },
          ),
        );
      };

      const handlePointerUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [floatingRect],
  );

  // Shrinking the Axon window can leave the floating frame hanging past the new
  // edge, and the resize handle can fall outside the frame the user is dragging.
  useEffect(() => {
    if (!floating || !floatingRect) return;
    const handleWindowResize = () => {
      setFloatingRect((currentRect) =>
        currentRect
          ? clampFloatingRect(currentRect, {
              width: window.innerWidth,
              height: window.innerHeight,
            })
          : currentRect,
      );
    };
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [floating, floatingRect]);

  // The frame animates its own insets on the docked/floating swap, so the same
  // mounted node carries the transition and the xterm inside it never detaches.
  // While the user drags, the transition is dropped so the frame tracks the
  // pointer one to one instead of easing behind it.
  const floatingTransition = floatingDragging
    ? "none"
    : `left ${FLOATING_TRANSITION_MS}ms ${FLOATING_TRANSITION_EASING}, top ${FLOATING_TRANSITION_MS}ms ${FLOATING_TRANSITION_EASING}, width ${FLOATING_TRANSITION_MS}ms ${FLOATING_TRANSITION_EASING}, height ${FLOATING_TRANSITION_MS}ms ${FLOATING_TRANSITION_EASING}`;

  const geometryRect =
    floatingAnimating && floatingTransitionRect
      ? floatingTransitionRect
      : floatingRect;
  const floatingGeometry: CSSProperties | undefined =
    floating && geometryRect
      ? {
          left: geometryRect.left,
          top: geometryRect.top,
          width: geometryRect.width,
          height: geometryRect.height,
          transition:
            floatingDragging || floatingAnimating ? floatingTransition : "none",
        }
      : undefined;

  return {
    floatingGeometry,
    floatingRect,
    handleDockToggle,
    handleDragEnd,
    handleDragMove,
    handleDragStart,
    handleFloatingResizeStart,
    handleFloatingToggle,
    resizeHandles: FLOATING_RESIZE_HANDLES,
    terminalFrameRef,
  };
}
