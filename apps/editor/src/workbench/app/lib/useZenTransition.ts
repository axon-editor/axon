/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 * --------------------------------------------------------------------------------------------*/

import { useEffect, useRef, useState } from "react";

// Defer chrome mounting so enter/exit of zen mode can cross-fade instead of
// popping the layout. While toggle is live (zenMode flipped) the shell keeps
// draining its chrome for `durationMs`, then unmounts it; on the way out it does
// the reverse so the editor and chrome exchange smoothly in both directions.
export function useZenTransition(zenMode: boolean, durationMs = 200) {
  const [chromeMounted, setChromeMounted] = useState(!zenMode);
  const [zenActive, setZenActive] = useState(zenMode);
  const prevZen = useRef(zenMode);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const wasOn = prevZen.current;
    prevZen.current = zenMode;
    if (wasOn === zenMode) return;

    if (timerRef.current !== null) window.clearTimeout(timerRef.current);

    if (zenMode) {
      setZenActive(true);
      setChromeMounted(true);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setChromeMounted(false);
      }, durationMs);
    } else {
      setChromeMounted(true);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setZenActive(false);
      }, durationMs);
    }
  }, [zenMode, durationMs]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return { zenActive, chromeMounted };
}
