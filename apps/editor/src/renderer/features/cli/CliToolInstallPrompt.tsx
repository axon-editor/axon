/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal, X } from "lucide-react";
import Tooltip from "../../shared/components/Tooltip";
import { type useCliToolInstallPrompt } from "./useCliToolInstallPrompt";

interface Props {
  prompt: ReturnType<typeof useCliToolInstallPrompt>;
}

export default function CliToolInstallPrompt({ prompt }: Props) {
  if (!prompt.open || !prompt.status) return null;

  return (
    <div className="fixed bottom-7 right-4 z-[75] w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] shadow-[0_24px_80px_rgba(0,0,0,0.48)] ring-1 ring-white/[0.03]">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-accent)]">
          <Terminal size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-[var(--axon-editor-foreground)]">
            Install the axon command
          </div>
          <div className="mt-1 text-[11px] leading-5 text-[var(--axon-editor-foreground)] opacity-70">
            Add <span className="font-mono text-[var(--axon-editor-foreground)]">axon</span>{" "}
            to your shell so{" "}
            <span className="font-mono text-[var(--axon-editor-foreground)]">"axon ."</span>,{" "}
            <span className="font-mono text-[var(--axon-editor-foreground)]">"axon ask"</span>,{" "}
            and{" "}
            <span className="font-mono text-[var(--axon-editor-foreground)]">"axon fix"</span>{" "}
            work from any project.
          </div>
          {prompt.error ? (
            <div className="mt-2 rounded border border-[var(--axon-danger-foreground)] bg-[var(--axon-danger-background)] px-2 py-1.5 text-[10px] leading-4 text-[var(--axon-danger-foreground)]">
              {prompt.error}
              {prompt.status.installCommand ? (
                <div className="mt-1 font-mono text-[var(--axon-danger-foreground)]">
                  {prompt.status.installCommand}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void prompt.install()}
              disabled={prompt.installing}
              className="h-7 cursor-pointer rounded border border-[var(--axon-accent)] bg-[color-mix(in_srgb,var(--axon-accent)_14%,var(--axon-panel-background))] px-3 text-[11px] text-[var(--axon-accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--axon-accent)_24%,var(--axon-panel-background))] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {prompt.installing ? "Installing..." : "Install"}
            </button>
            <button
              type="button"
              onClick={prompt.dismiss}
              className="h-7 cursor-pointer rounded border border-[var(--axon-panel-border)] px-3 text-[11px] text-[var(--axon-editor-foreground)] opacity-70 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
            >
              Not now
            </button>
          </div>
        </div>
        <Tooltip label="Dismiss command-line tool prompt" side="left">
          <button
            type="button"
            onClick={prompt.dismiss}
            aria-label="Dismiss command-line tool prompt"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
          >
            <X size={13} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
