import {
  useCallback,
  useRef,
  type PointerEvent,
} from "react";

interface UseAgentSidebarResizeOptions {
  side: "left" | "right";
  width: number;
  onWidthChange: (width: number) => void;
}

// Sidebar resizing has enough pointer-capture state to deserve its own hook.
// Keeping the drag math here prevents the Agent surface from mixing layout
// mechanics with model streaming and conversation rendering, and it also keeps
// the right-side/left-side delta handling in one tested place for future panes.
export function useAgentSidebarResize({
  side,
  width,
  onWidthChange,
}: UseAgentSidebarResizeOptions) {
  const resizeStateRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);

  const startResize = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      resizeStateRef.current = {
        startX: event.clientX,
        startWidth: width,
      };
    },
    [width],
  );

  const resize = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;

      const delta =
        side === "right"
          ? resizeState.startX - event.clientX
          : event.clientX - resizeState.startX;
      const nextWidth = Math.min(
        720,
        Math.max(340, resizeState.startWidth + delta),
      );
      onWidthChange(nextWidth);
    },
    [onWidthChange, side],
  );

  const stopResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (resizeStateRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeStateRef.current = null;
  }, []);

  return {
    resize,
    startResize,
    stopResize,
  };
}
