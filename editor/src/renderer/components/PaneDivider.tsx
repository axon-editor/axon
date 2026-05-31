// Draggable divider between editor panes.
// Horizontal divider resizes panes left/right.
// Vertical divider resizes panes top/bottom.
// Uses pointer capture so drag works even if mouse leaves the element.
import { useRef } from "react";

interface Props {
  direction: "horizontal" | "vertical";
  onResize: (delta: number) => void;
}

export default function PaneDivider({ direction, onResize }: Props) {
  const dragging = useRef(false);
  const lastPos = useRef(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    lastPos.current = direction === "horizontal" ? e.clientX : e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const current = direction === "horizontal" ? e.clientX : e.clientY;
    const delta = current - lastPos.current;
    lastPos.current = current;
    onResize(delta);
  };

  const handlePointerUp = () => {
    dragging.current = false;
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`
        bg-[#222838] hover:bg-[#80c8e0] transition-colors shrink-0
        ${
          direction === "horizontal"
            ? "w-px cursor-col-resize hover:w-0.5"
            : "h-px cursor-row-resize hover:h-0.5"
        }
      `}
    />
  );
}
