/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Drag-to-resize support for the large modal panels. The viewport-clamped
// widths pick a sensible size per window, but a diff or extension browser
// still deserves the layout the user chose, so the corner handle stores a
// pixel size per modal id and restores it on the next open. Double-clicking
// the handle (or pressing Escape on it) drops back to the responsive default.
// Sizes clamp to the viewport minus the overlay padding on every move and
// again whenever the window shrinks, so a stored panel can never strand
// itself off-screen.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

const STORAGE_PREFIX = "axon.resizable-modal.v1.";
const MIN_WIDTH = 480;
const MIN_HEIGHT = 320;
const VIEWPORT_MARGIN_X = 32;
const VIEWPORT_MARGIN_Y = 48;
const KEYBOARD_STEP = 32;

interface ModalSize {
  width: number;
  height: number;
}

function clampSize(size: ModalSize): ModalSize {
  return {
    width: Math.min(
      Math.max(size.width, MIN_WIDTH),
      Math.max(MIN_WIDTH, window.innerWidth - VIEWPORT_MARGIN_X),
    ),
    height: Math.min(
      Math.max(size.height, MIN_HEIGHT),
      Math.max(MIN_HEIGHT, window.innerHeight - VIEWPORT_MARGIN_Y),
    ),
  };
}

function readStoredSize(id: string | undefined): ModalSize | null {
  if (!id) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Partial<ModalSize>).width !== "number" ||
      typeof (parsed as Partial<ModalSize>).height !== "number"
    ) {
      return null;
    }
    return clampSize(parsed as ModalSize);
  } catch {
    return null;
  }
}

export interface ResizableHandleProps {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
}

export function useResizablePanel(
  panelRef: RefObject<HTMLElement | null>,
  id?: string,
) {
  const [size, setSize] = useState<ModalSize | null>(() => readStoredSize(id));
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const persist = useCallback(
    (next: ModalSize | null) => {
      if (!id) return;
      if (next) {
        window.localStorage.setItem(
          STORAGE_PREFIX + id,
          JSON.stringify(next),
        );
      } else {
        window.localStorage.removeItem(STORAGE_PREFIX + id);
      }
    },
    [id],
  );

  // A window that shrinks below a stored size would strand the panel past the
  // viewport edge, so I clamp the restored size again on every window change.
  useEffect(() => {
    const handleWindowResize = () => {
      const current = sizeRef.current;
      if (!current) return;
      const next = clampSize(current);
      if (
        next.width === current.width &&
        next.height === current.height
      ) {
        return;
      }
      setSize(next);
      persist(next);
    };
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [persist]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!id) return;
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;
      event.preventDefault();

      const originX = event.clientX;
      const originY = event.clientY;
      const start = clampSize({ width: rect.width, height: rect.height });
      let latest = start;
      let moved = false;

      const handleMove = (moveEvent: globalThis.PointerEvent) => {
        moved = true;
        latest = clampSize({
          width: start.width + moveEvent.clientX - originX,
          height: start.height + moveEvent.clientY - originY,
        });
        setSize(latest);
      };
      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        document.body.style.removeProperty("user-select");
        if (moved) persist(latest);
      };

      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [id, panelRef, persist],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (!id) return;
      if (event.key === "Escape") {
        // The modal shell closes on a document-level Escape, so stop this one
        // here instead of resetting the size and dismissing the panel.
        event.stopPropagation();
        setSize(null);
        persist(null);
        return;
      }
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;

      let widthDelta = 0;
      let heightDelta = 0;
      if (event.key === "ArrowLeft") widthDelta = -KEYBOARD_STEP;
      else if (event.key === "ArrowRight") widthDelta = KEYBOARD_STEP;
      else if (event.key === "ArrowUp") heightDelta = -KEYBOARD_STEP;
      else if (event.key === "ArrowDown") heightDelta = KEYBOARD_STEP;
      else return;

      event.preventDefault();
      const current =
        sizeRef.current ??
        clampSize({ width: rect.width, height: rect.height });
      const next = clampSize({
        width: current.width + widthDelta,
        height: current.height + heightDelta,
      });
      setSize(next);
      persist(next);
    },
    [id, panelRef, persist],
  );

  const reset = useCallback(() => {
    setSize(null);
    persist(null);
  }, [persist]);

  const style: CSSProperties | undefined = size
    ? {
        width: `${size.width}px`,
        height: `${size.height}px`,
        minHeight: 0,
        maxHeight: "none",
      }
    : undefined;

  return {
    style,
    reset,
    handleProps: {
      onPointerDown: handlePointerDown,
      onDoubleClick: reset,
      onKeyDown: handleKeyDown,
    } satisfies ResizableHandleProps,
  };
}

export function PanelResizeHandle({
  onPointerDown,
  onDoubleClick,
  onKeyDown,
}: ResizableHandleProps) {
  return (
    <div
      role="separator"
      aria-label="Resize modal"
      tabIndex={0}
      title="Drag to resize; double-click or Escape to reset"
      className="absolute bottom-0 right-0 z-10 h-[18px] w-[18px] cursor-nwse-resize outline-none"
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    >
      <span className="pointer-events-none absolute bottom-[4px] right-[4px] block h-[8px] w-[8px] border-b border-r border-[var(--axon-editor-foreground)] opacity-35" />
    </div>
  );
}
