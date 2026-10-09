/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Height state for the docked bottom panel plus its top-edge drag. Split from
// Terminal so the panel's visibility logic stops owning pointer gesture code.
import { useCallback, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  DEFAULT_TERMINAL_HEIGHT,
  MIN_TERMINAL_HEIGHT,
} from "@axon-editor/platform/terminal/protocol/terminalProtocol";

// The docked panel may claim at most 78% of the window: past that the editor
// behind it stops being usable, which is the whole difference between a bottom
// panel and zoom.
const DOCKED_MAX_VIEWPORT_FRACTION = 0.78;

export function usePanelHeightResize({
  floating,
  zoomed,
}: {
  floating: boolean;
  zoomed: boolean;
}) {
  const [height, setHeight] = useState(DEFAULT_TERMINAL_HEIGHT);

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (zoomed || floating) return;

      const startY = event.clientY;
      const startHeight = height;
      const maxHeight = Math.max(
        MIN_TERMINAL_HEIGHT,
        Math.floor(window.innerHeight * DOCKED_MAX_VIEWPORT_FRACTION),
      );

      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextHeight = startHeight + startY - moveEvent.clientY;
        setHeight(
          Math.min(maxHeight, Math.max(MIN_TERMINAL_HEIGHT, nextHeight)),
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
    [floating, height, zoomed],
  );

  return { height, handleResizeStart };
}
