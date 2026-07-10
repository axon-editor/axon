// Draggable divider between editor panes.
// Horizontal divider resizes panes left/right.
// Vertical divider resizes panes top/bottom.
// Uses pointer capture so drag works even if mouse leaves the element.
import { useEffect, useRef } from "react";

interface Props {
  direction: "horizontal" | "vertical";
  onResize: (delta: number) => void;
}

export default function PaneDivider({ direction, onResize }: Props) {
  const dragging = useRef(false);
  const lastPos = useRef(0);
  const pendingDelta = useRef(0);
  const resizeFrame = useRef<number | null>(null);

  const flushResize = () => {
    resizeFrame.current = null;
    const delta = pendingDelta.current;
    pendingDelta.current = 0;
    if (delta !== 0) onResize(delta);
  };

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (resizeFrame.current !== null) {
        window.cancelAnimationFrame(resizeFrame.current);
      }
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    lastPos.current = direction === "horizontal" ? e.clientX : e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.cursor =
      direction === "horizontal" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const current = direction === "horizontal" ? e.clientX : e.clientY;
    const delta = current - lastPos.current;
    lastPos.current = current;
    pendingDelta.current += delta;
    if (resizeFrame.current === null) {
      // Monaco lays itself out after the flex tracks change. Limiting React size
      // updates to one per paint keeps divider motion smooth and avoids asking all
      // visible editors to recalculate dimensions for every raw pointer event.
      resizeFrame.current = window.requestAnimationFrame(flushResize);
    }
  };

  const stopDragging = () => {
    dragging.current = false;
    if (resizeFrame.current !== null) {
      window.cancelAnimationFrame(resizeFrame.current);
      flushResize();
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onLostPointerCapture={stopDragging}
      role="separator"
      aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
      className={`group relative z-20 shrink-0 touch-none ${
        direction === "horizontal"
          ? "h-full w-2 cursor-col-resize"
          : "h-2 w-full cursor-row-resize"
      }`}
    >
      <div
        className={`absolute bg-[#222838] transition-colors group-hover:bg-[#80c8e0] ${
          direction === "horizontal"
            ? "inset-y-0 left-1/2 w-px -translate-x-1/2"
            : "inset-x-0 top-1/2 h-px -translate-y-1/2"
        }`}
      />
    </div>
  );
}
