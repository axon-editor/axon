/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useRef } from "react";
import { type AppGlassMode } from "../../../../shared/core/settings";

// macOS allocates the native vibrancy layer after the window exists when Glass
// is enabled at runtime. The main process invalidates the surface as soon as it
// enables that material, but the renderer may not have painted the Glass class
// and variables yet. A second invalidation after the first Glass frame commits
// gives Chromium a clean surface for the workbench cards and popup backdrops
// instead of letting them sample the old opaque frame.
function scheduleGlassSurfaceRefresh() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void window.axon.refreshWindowGlass().catch((error) => {
        console.warn("failed to refresh the native glass surface:", error);
      });
    });
  });
}

export function useNativeGlassSurface(
  mode: AppGlassMode | null,
  opaqueBackground: string,
  appearance: "light" | "dark",
) {
  const previousMode = useRef<AppGlassMode | null>(null);

  useEffect(() => {
    if (!mode) return;

    const glassActive = mode !== "off";
    const wasOff = previousMode.current === "off";
    previousMode.current = mode;

    document.documentElement.classList.toggle("axon-native-glass", glassActive);

    const synchronize = window.axon
      .setWindowGlass(mode, opaqueBackground, appearance)
      .catch((error) => {
        console.warn("failed to synchronize native window glass:", error);
      });

    if (glassActive && wasOff) {
      void synchronize.then(scheduleGlassSurfaceRefresh);
    }

    return () => {
      document.documentElement.classList.remove("axon-native-glass");
    };
  }, [appearance, mode, opaqueBackground]);
}
