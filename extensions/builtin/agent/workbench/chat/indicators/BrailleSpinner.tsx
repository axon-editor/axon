/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from "react";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_DURATION_MS = 80;

export default function BrailleSpinner() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % FRAMES.length);
    }, FRAME_DURATION_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span
      aria-hidden="true"
      className="w-3 shrink-0 text-center font-mono text-[10px] leading-none text-[var(--axon-syntax-function)]"
    >
      {FRAMES[frame]}
    </span>
  );
}
