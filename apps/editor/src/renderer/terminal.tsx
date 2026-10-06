/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Floating Terminal window entry. Like the Settings window it never boots the
// editor shell: no Monaco, no extension activation, no splash. It pulls the
// adopted session snapshot from main, then syncs settings + theme + glass the
// same way SettingsSurfaceRoot does, but only so the Terminal surface can live
// in a window that matches the docked/zoomed chrome.

import { createRoot } from "react-dom/client";
import "@fontsource-variable/fira-code/wght.css";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/ibm-plex-sans/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./index.css";
import "./App.css";
import TerminalWindowApp from "./terminal/TerminalWindowApp";

// The static drag strip lives in terminal.html so the window stays draggable
// during startup. Once the terminal header's native drag region mounts, this
// strip must get out of the way.
document.body.classList.add("axon-react-ready");

function renderStartupFailure(err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown startup error.";
  document.getElementById("root")!.innerHTML = `
    <div class="terminal-startup-failure">
      <div class="terminal-startup-failure__card">
        <div class="terminal-startup-failure__title">Terminal could not start</div>
        <div class="terminal-startup-failure__message">${message.replace(
          /[&<>"']/g,
          (char) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            })[char] ?? char,
        )}</div>
      </div>
    </div>
  `;
}

async function boot() {
  try {
    const axonApi = window.axon;
    if (!axonApi) {
      throw new Error(
        "The Terminal preload is not available. Open the terminal window through the editor, not the raw Vite browser URL.",
      );
    }

    createRoot(document.getElementById("root")!).render(<TerminalWindowApp />);
  } catch (err) {
    console.error("failed to boot the terminal surface:", err);
    renderStartupFailure(err);
  }
}

void boot();