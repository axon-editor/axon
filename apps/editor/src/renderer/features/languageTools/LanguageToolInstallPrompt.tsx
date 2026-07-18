import { Braces, Download, X } from "lucide-react";
import Tooltip from "../../shared/components/Tooltip";
import type { useLanguageToolInstallPrompt } from "./useLanguageToolInstallPrompt";

interface Props {
  prompt: ReturnType<typeof useLanguageToolInstallPrompt>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LanguageToolInstallPrompt({ prompt }: Props) {
  if (!prompt.open || !prompt.status) return null;

  const progressPercent = prompt.progress?.percent;
  const progressLabel =
    prompt.progress?.phase === "downloading" && prompt.progress.total
      ? `${formatBytes(prompt.progress.transferred ?? 0)} of ${formatBytes(prompt.progress.total)}`
      : prompt.progress?.phase === "verifying"
        ? "Verifying download"
        : prompt.progress?.phase === "installing"
          ? "Installing"
          : prompt.progress?.phase === "resolving"
            ? "Finding the latest verified release"
            : null;

  return (
    <div className="fixed bottom-7 right-4 z-[76] w-[min(400px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] text-[var(--axon-editor-foreground)] shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-syntax-function)]">
          <Braces size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium">
            Install {prompt.status.label} support?
          </div>
          <div className="mt-1 text-[11px] leading-5 opacity-65">
            Axon already provides syntax highlighting. Install the managed
            language server for completion, diagnostics, hover, navigation, and
            formatting.
          </div>

          {prompt.installing && progressLabel ? (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[10px] opacity-55">
                <span>{progressLabel}</span>
                {typeof progressPercent === "number" ? (
                  <span>{Math.round(progressPercent)}%</span>
                ) : null}
              </div>
              <div className="h-1 overflow-hidden rounded bg-[var(--axon-panel-overlay-hover)]">
                <div
                  className="h-full bg-[var(--axon-syntax-function)] transition-[width] duration-150"
                  style={{ width: `${progressPercent ?? 18}%` }}
                />
              </div>
            </div>
          ) : null}

          {prompt.error ? (
            <div className="mt-2 rounded border border-[#8d3b45] bg-[#5b2028]/30 px-2 py-1.5 text-[10px] leading-4 text-[#ff9ca8]">
              {prompt.error}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void prompt.install()}
              disabled={prompt.installing || !prompt.status.supported}
              className="flex h-7 cursor-pointer items-center gap-1.5 rounded border border-[var(--axon-syntax-function)] bg-[var(--axon-panel-overlay-hover)] px-3 text-[11px] transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Download size={12} />
              {prompt.installing ? "Installing" : "Install"}
            </button>
            {prompt.installing ? (
              <button
                type="button"
                onClick={() => void prompt.cancel()}
                className="h-7 cursor-pointer rounded px-2 text-[11px] opacity-65 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              onClick={prompt.dismiss}
              disabled={prompt.installing}
              className="h-7 cursor-pointer rounded px-2 text-[11px] opacity-60 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={prompt.neverAsk}
              disabled={prompt.installing}
              className="h-7 cursor-pointer rounded px-2 text-[11px] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-90 disabled:cursor-not-allowed"
            >
              Don't ask again
            </button>
          </div>
        </div>
        <Tooltip label="Dismiss language tool recommendation" side="left">
          <button
            type="button"
            onClick={prompt.dismiss}
            disabled={prompt.installing}
            aria-label="Dismiss language tool recommendation"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-not-allowed"
          >
            <X size={13} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
