import { performance } from "node:perf_hooks";

interface ExtensionHostTimingDetail {
  extensionId?: string;
  event?: string;
  folderPath?: string | null;
  count?: number;
  source?: string;
}

function formatDetail(detail?: ExtensionHostTimingDetail) {
  if (!detail) return "";
  const entries = Object.entries(detail).filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );
  if (entries.length === 0) return "";
  return ` ${entries.map(([key, value]) => `${key}=${String(value)}`).join(" ")}`;
}

// Extension host diagnostics stay in the main process because discovery,
// activation, and future isolated process startup all happen before the
// renderer can explain what went wrong. These timing lines are intentionally
// small and structured so GitHub build logs, local dev logs, and user bug
// reports show the exact extension phase that became slow or failed.
export function markExtensionHostTiming(
  phase: string,
  startedAt: number,
  detail?: ExtensionHostTimingDetail,
) {
  if (process.env.AXON_EXTENSION_TIMINGS !== "1") return;

  const durationMs = Math.max(0, performance.now() - startedAt);
  console.info(
    `[extensions] ${phase} ${durationMs.toFixed(1)}ms${formatDetail(detail)}`,
  );
}

export function startExtensionHostTiming() {
  return performance.now();
}
