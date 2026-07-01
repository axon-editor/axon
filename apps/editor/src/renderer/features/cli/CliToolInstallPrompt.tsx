import { Terminal, X } from "lucide-react";
import Tooltip from "../../shared/components/Tooltip";
import { type useCliToolInstallPrompt } from "./useCliToolInstallPrompt";

interface Props {
  prompt: ReturnType<typeof useCliToolInstallPrompt>;
}

export default function CliToolInstallPrompt({ prompt }: Props) {
  if (!prompt.open || !prompt.status) return null;

  return (
    <div className="fixed bottom-7 right-4 z-[75] w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-[#253044] bg-[#0e121b] shadow-[0_24px_80px_rgba(0,0,0,0.48)] ring-1 ring-white/[0.03]">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#243247] bg-[#111a27] text-[#80c8e0]">
          <Terminal size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-[#f4f7fb]">
            Install the axon command
          </div>
          <div className="mt-1 text-[11px] leading-5 text-[#9aa4b8]">
            Add <span className="font-mono text-[#dce4f0]">axon</span> to your
            shell so <span className="font-mono text-[#dce4f0]">axon .</span>,{" "}
            <span className="font-mono text-[#dce4f0]">axon ask</span>, and{" "}
            <span className="font-mono text-[#dce4f0]">axon fix</span> work
            from any project.
          </div>
          {prompt.error ? (
            <div className="mt-2 rounded border border-[#5b2630] bg-[#2a1117] px-2 py-1.5 text-[10px] leading-4 text-[#ffb4c0]">
              {prompt.error}
              {prompt.status.installCommand ? (
                <div className="mt-1 font-mono text-[#ffd7de]">
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
              className="h-7 cursor-pointer rounded border border-[#80c8e0] bg-[#142a36] px-3 text-[11px] text-[#dff7ff] transition-colors hover:bg-[#183345] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {prompt.installing ? "Installing..." : "Install"}
            </button>
            <button
              type="button"
              onClick={prompt.dismiss}
              className="h-7 cursor-pointer rounded border border-[#2a3346] px-3 text-[11px] text-[#9aa4b8] transition-colors hover:bg-[#151923] hover:text-white"
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
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[#1e2430] hover:text-white"
          >
            <X size={13} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
