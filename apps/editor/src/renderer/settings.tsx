/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Dedicated Settings window entry. Unlike the editor entry (src/renderer/main.tsx),
// this surface never boots the editor shell: no splash animation, no Monaco
// worker setup, no language registration, and no onStartup activation of every
// extension. It reads the settings + font + extension metadata directly and
// mounts SettingsSurfaceRoot, so opening settings is a small window, not a
// second copy of the app.

import { createRoot } from "react-dom/client";
import "@fontsource-variable/fira-code/wght.css";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/ibm-plex-sans/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./index.css";
import "./App.css";
import SettingsSurfaceRoot from "./settings/SettingsSurfaceRoot";

// The static drag strip lives in settings.html so the window stays draggable
// during startup. Once React is mounted, SettingsHeader's toolbar drag region
// owns the hit-test area and this strip must get out of the way.
document.body.classList.add("axon-react-ready");

function renderStartupFailure(err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown startup error.";
  document.getElementById("root")!.innerHTML = `
    <div class="settings-startup-failure">
      <div class="settings-startup-failure__card">
        <div class="settings-startup-failure__title">Settings could not start</div>
        <div class="settings-startup-failure__message">${message.replace(/[&<>"']/g, (char) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char] ?? char)}</div>
      </div>
    </div>
  `;
}

async function boot() {
  try {
    const axonApi = window.axon;
    if (!axonApi) {
      throw new Error(
        "The Settings preload is not available. Open Settings through the editor window, not the raw Vite browser URL.",
      );
    }

    createRoot(document.getElementById("root")!).render(<SettingsSurfaceRoot />);
  } catch (err) {
    console.error("failed to boot the settings surface:", err);
    renderStartupFailure(err);
  }
}

void boot();