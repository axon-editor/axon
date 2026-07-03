import {
  CheckCircle2,
  Circle,
  Clock3,
  RefreshCw,
  Square,
  XCircle,
} from "lucide-react";
import {
  type TestOutputEvent,
  type TestProvider,
  type TestRunStatus,
} from "@axon-editor/shared/tests";

export interface RunRecord {
  runId: string;
  providerId: string;
  targetId: string | null;
  label: string;
  status: TestRunStatus;
  startedAt: number;
  durationMs: number | null;
  exitCode: number | null;
}

export type OutputFilter = "all" | "selected";

export function providerRootLabel(provider: TestProvider) {
  return (
    provider.rootPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() ??
    provider.label
  );
}

export function statusClassName(status: TestRunStatus) {
  if (status === "passed") return "text-[#80d991]";
  if (status === "failed") return "text-[#ff8a8a]";
  if (status === "stopped") return "text-[#f0c674]";
  if (status === "running") return "text-[var(--axon-syntax-function)]";
  return "text-[var(--axon-editor-foreground)] opacity-35";
}

export function StatusIcon({ status }: { status: TestRunStatus }) {
  if (status === "passed") return <CheckCircle2 size={13} />;
  if (status === "failed") return <XCircle size={13} />;
  if (status === "stopped") return <Square size={12} />;
  if (status === "running") {
    return <RefreshCw size={13} className="animate-spin" />;
  }
  return <Circle size={12} />;
}

export function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "running";
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

export function runKeyFor(providerId: string, targetId?: string | null) {
  return targetId ?? providerId;
}

export function normalizePathForCompare(value: string) {
  return value.replace(/\\/g, "/").replace(/\/+$/g, "");
}

export function isEventInsideWorkspace(
  event: Pick<TestOutputEvent, "rootPath">,
  folderPath: string | null,
) {
  if (!folderPath) return false;
  const workspaceRoot = normalizePathForCompare(folderPath);
  const eventRoot = normalizePathForCompare(event.rootPath);
  return eventRoot === workspaceRoot || eventRoot.startsWith(`${workspaceRoot}/`);
}

export function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] px-2 py-1.5">
      <div className={`text-[13px] font-medium ${tone}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-35">
        {label}
      </div>
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <Clock3
        size={18}
        className="text-[var(--axon-editor-foreground)] opacity-25"
      />
      <div className="mt-3 text-[12px] text-[var(--axon-editor-foreground)] opacity-65">
        {title}
      </div>
      <div className="mt-1 text-[11px] leading-5 text-[var(--axon-editor-foreground)] opacity-40">
        {detail}
      </div>
    </div>
  );
}

export function RunPill({ run }: { run: RunRecord | null }) {
  const status = run?.status ?? "queued";
  return (
    <span
      className={`flex h-8 items-center gap-2 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-3 text-[11px] ${statusClassName(status)}`}
    >
      <StatusIcon status={status} />
      {run ? `${status} · ${formatDuration(run.durationMs)}` : "not run"}
    </span>
  );
}

export function DetailPanel({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-35">
        {title}
      </div>
      <div className="mt-2 truncate text-[13px] text-[var(--axon-editor-foreground)]">
        {value}
      </div>
      <div className="mt-1 truncate text-[11px] text-[var(--axon-editor-foreground)] opacity-45">
        {detail}
      </div>
    </div>
  );
}
