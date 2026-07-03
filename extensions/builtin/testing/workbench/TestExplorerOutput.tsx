import { TerminalSquare } from "lucide-react";
import { type TestOutputEvent } from "@axon-editor/shared/tests";
import { type OutputFilter } from "./TestExplorerPrimitives";

interface Props {
  outputFilter: OutputFilter;
  visibleOutput: TestOutputEvent[];
  onOutputFilterChange: (filter: OutputFilter) => void;
}

export default function TestExplorerOutput({
  outputFilter,
  visibleOutput,
  onOutputFilterChange,
}: Props) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--axon-panel-border)] px-3">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-60">
          <TerminalSquare size={13} />
          Output
        </div>
        <div className="flex items-center rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-1">
          {(["selected", "all"] as OutputFilter[]).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => onOutputFilterChange(filter)}
              className={`h-7 cursor-pointer rounded px-2.5 text-[11px] capitalize transition-colors ${
                outputFilter === filter
                  ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                  : "text-[var(--axon-editor-foreground)] opacity-45 hover:opacity-90"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-5">
        {visibleOutput.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[var(--axon-editor-foreground)] opacity-35">
            no test output yet
          </div>
        ) : (
          visibleOutput.map((event, index) => (
            <div
              key={`${event.runId}:${index}`}
              className={
                event.stream === "stderr"
                  ? "text-[#ff9aa2]"
                  : event.stream === "system"
                    ? "text-[var(--axon-syntax-function)]"
                    : "text-[var(--axon-editor-foreground)] opacity-70"
              }
            >
              {event.line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
