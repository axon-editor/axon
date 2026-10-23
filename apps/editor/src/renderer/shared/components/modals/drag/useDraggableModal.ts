/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Modals are centered by the overlay, so the drag offset is added as a
// transform on top of that layout instead of replacing it. The offset stays
// inside the viewport on every move and is not persisted: a modal should open
// in the same predictable place every time, while the resize hook already owns
// the remembered size.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

const VIEWPORT_MARGIN = 8;
const PRIMARY_POINTER_BUTTON = 0;
const INTERACTIVE_SELECTOR =
  "button, input, textarea, select, a, [role='button'], [role='separator']";

interface Offset {
  x: number;
  y: number;
}

export interface DraggableHandleProps {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}

function clampOffset(offset: Offset, rect: DOMRect): Offset {
  // getBoundingClientRect includes the current transform, so subtract the
  // current offset to recover the panel's centered position.
  const baseLeft = rect.left - offset.x;
  const baseTop = rect.top - offset.y;
  const minX = VIEWPORT_MARGIN - baseLeft;
  const maxX = window.innerWidth - VIEWPORT_MARGIN - rect.width - baseLeft;
  const minY = VIEWPORT_MARGIN - baseTop;
  const maxY = window.innerHeight - VIEWPORT_MARGIN - rect.height - baseTop;

  return {
    x: Math.min(Math.max(offset.x, minX), maxX),
    y: Math.min(Math.max(offset.y, minY), maxY),
  };
}

export function useDraggableModal(
  panelRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  const stopDragRef = useRef<(() => void) | null>(null);
  offsetRef.current = offset;

  useEffect(() => {
    if (!enabled) setOffset({ x: 0, y: 0 });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const handleWindowResize = () => {
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      setOffset((current) => {
        const next = clampOffset(current, rect);
        return next.x === current.x && next.y === current.y ? current : next;
      });
    };

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [enabled, panelRef]);

  useEffect(() => {
    return () => stopDragRef.current?.();
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== PRIMARY_POINTER_BUTTON) return;

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(INTERACTIVE_SELECTOR)
      ) {
        return;
      }

      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;

      event.preventDefault();
      stopDragRef.current?.();

      const originX = event.clientX;
      const originY = event.clientY;
      const startOffset = offsetRef.current;
      const previousUserSelect = document.body.style.userSelect;

      const handleMove = (moveEvent: globalThis.PointerEvent) => {
        setOffset(
          clampOffset(
            {
              x: startOffset.x + moveEvent.clientX - originX,
              y: startOffset.y + moveEvent.clientY - originY,
            },
            rect,
          ),
        );
      };

      const stopDrag = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", stopDrag);
        window.removeEventListener("pointercancel", stopDrag);
        document.body.style.userSelect = previousUserSelect;
        stopDragRef.current = null;
      };

      stopDragRef.current = stopDrag;
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", stopDrag);
      window.addEventListener("pointercancel", stopDrag);
    },
    [enabled, panelRef],
  );

  const style: CSSProperties | undefined =
    offset.x === 0 && offset.y === 0
      ? undefined
      : { transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` };

  return {
    style,
    handleProps: {
      onPointerDown: handlePointerDown,
    } satisfies DraggableHandleProps,
  };
}
