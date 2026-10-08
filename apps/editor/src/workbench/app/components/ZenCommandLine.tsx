/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 * --------------------------------------------------------------------------------------------*/

// Vim-style command readout that flashes underneath the editor whenever a chrome
// shortcut fires in zen mode, then fades on its own. It swaps its key per event
// so the CSS animation replays without any imperative animation control.
import { useEffect, useState } from "react";
import { AXON_ZEN_COMMAND_EVENT } from "../../../shared/zenCommandLine";

export default function ZenCommandLine() {
  const [notice, setNotice] = useState<{ label: string; nonce: number } | null>(
    null,
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const label = (event as CustomEvent<string>).detail;
      if (!label) return;
      setNotice((previous) => ({
        label,
        nonce: (previous?.nonce ?? 0) + 1,
      }));
    };
    window.addEventListener(AXON_ZEN_COMMAND_EVENT, handler);
    return () => window.removeEventListener(AXON_ZEN_COMMAND_EVENT, handler);
  }, []);

  if (!notice) return null;

  return (
    <div key={notice.nonce} className="axon-zen-cmdline" role="status">
      <span className="truncate">{notice.label}</span>
    </div>
  );
}
