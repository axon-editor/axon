import { useEffect, useMemo, useState } from "react";
import { Play, RefreshCw, X } from "lucide-react";
import {
  type TestDiscoveryResult,
  type TestFinishedEvent,
  type TestItem,
  type TestOutputEvent,
  type TestProvider,
} from "../../../shared/tests";
import Tooltip from "../../shared/components/Tooltip";

interface Props {
  folderPath: string | null;
  open: boolean;
  onClose: () => void;
  onOutput: (
    message: string,
    level?: "info" | "success" | "warning" | "error",
  ) => void;
}

export default function TestExplorerModal({
  folderPath,
  open,
  onClose,
  onOutput,
}: Props) {
  const [discovery, setDiscovery] = useState<TestDiscoveryResult | null>(null);
  const [runningProviderId, setRunningProviderId] = useState<string | null>(null);
  const [output, setOutput] = useState<TestOutputEvent[]>([]);
  const providers = discovery?.providers ?? [];
  const items = discovery?.items ?? [];

  const latestOutput = useMemo(() => output.slice(-120), [output]);

  const discover = async () => {
    if (!folderPath) {
      setDiscovery(null);
      return;
    }

    const result = await window.axon.discoverTests(folderPath);
    setDiscovery(result);
    onOutput(result.message, result.ok ? "info" : "warning");
  };

  useEffect(() => {
    if (!open) return;
    void discover().catch((err) => {
      console.error("test discovery failed:", err);
      onOutput("Test discovery failed.", "error");
    });
  }, [folderPath, open]);

  useEffect(() => {
    if (!open) return;
    const cleanupOutput = window.axon.onTestOutput((event) => {
      setOutput((current) => [...current.slice(-119), event]);
    });
    const cleanupFinished = window.axon.onTestFinished(
      (event: TestFinishedEvent) => {
        setRunningProviderId(null);
        onOutput(
          event.exitCode === 0
            ? `${event.label} passed.`
            : `${event.label} failed.`,
          event.exitCode === 0 ? "success" : "error",
        );
      },
    );
    return () => {
      cleanupOutput();
      cleanupFinished();
    };
  }, [onOutput, open]);

  const runProvider = async (providerId: string, targetId?: string | null) => {
    if (!folderPath) return;
    setRunningProviderId(targetId ?? providerId);
    const result = await window.axon.runTests(folderPath, providerId, targetId);
    onOutput(result.message, result.ok ? "info" : "error");
    if (!result.ok) setRunningProviderId(null);
  };

  const providerItems = (provider: TestProvider): TestItem[] =>
    items.filter((item) => item.providerId === provider.id);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/45">
      <div className="absolute bottom-8 left-1/2 top-20 flex w-[min(860px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-[#2a3042] bg-[#11141d] shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#222838] bg-[#141824] px-4">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[#9aa4b8]">
            test explorer
          </span>
          <div className="flex items-center gap-1">
            <Tooltip label="Rediscover tests in this workspace" side="bottom">
              <button
                type="button"
                aria-label="Rediscover tests in this workspace"
                onClick={() => void discover()}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[#151923] hover:text-white"
              >
                <RefreshCw size={13} />
              </button>
            </Tooltip>
            <Tooltip label="Close test explorer" side="bottom">
              <button
                type="button"
                aria-label="Close test explorer"
                onClick={onClose}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[#586478] transition-colors hover:bg-[#151923] hover:text-white"
              >
                <X size={13} />
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr]">
          <div className="min-h-0 overflow-y-auto border-r border-[#222838] p-3">
            {!folderPath ? (
              <div className="text-[12px] text-[#586478]">
                Open a workspace to discover tests.
              </div>
            ) : providers.length === 0 ? (
              <div className="text-[12px] text-[#586478]">
                {discovery?.message ?? "No test providers found."}
              </div>
            ) : (
              <div className="space-y-2">
                {providers.map((provider) => (
                  <div
                    key={provider.id}
                    className="rounded-md border border-[#1d2432] bg-[#0d1018]"
                  >
                    <button
                      type="button"
                      onClick={() => void runProvider(provider.id)}
                      disabled={runningProviderId !== null}
                      className="grid w-full cursor-pointer grid-cols-[20px_1fr] gap-2 px-3 py-2 text-left transition-colors hover:bg-[#121723] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Play size={13} className="mt-0.5 text-[#80c8e0]" />
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] text-[#dce4f0]">
                          {provider.label}
                        </span>
                        <span className="block truncate text-[10px] text-[#586478]">
                          {provider.detail}
                        </span>
                      </span>
                    </button>
                    {providerItems(provider).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => void runProvider(provider.id, item.id)}
                        disabled={runningProviderId !== null}
                        className="grid w-full cursor-pointer grid-cols-[20px_1fr] gap-2 border-t border-[#151923] px-3 py-1.5 text-left transition-colors hover:bg-[#121723] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="ml-1 mt-1 h-1.5 w-1.5 rounded-full bg-[#647086]" />
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] text-[#c8d0e0]">
                            {item.label}
                          </span>
                          <span className="block truncate text-[10px] text-[#586478]">
                            {item.kind}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="min-h-0 overflow-y-auto bg-[#0b0e15] p-3 font-mono text-[11px] leading-5">
            {latestOutput.length === 0 ? (
              <div className="text-[#465166]">no test output yet</div>
            ) : (
              latestOutput.map((event, index) => (
                <div
                  key={`${event.runId}:${index}`}
                  className={
                    event.stream === "stderr"
                      ? "text-[#ff9aa2]"
                      : event.stream === "system"
                        ? "text-[#80c8e0]"
                        : "text-[#9aa4b8]"
                  }
                >
                  {event.line}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
