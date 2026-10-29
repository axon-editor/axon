/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState } from "react";
import {
  Check,
  Loader2,
  Play,
  ShieldCheck,
  SkipForward,
  X,
} from "lucide-react";
import { type AgentToolCallState } from "../../lib/conversation";

interface Props {
  tool: AgentToolCallState;
  onRun: (tool: AgentToolCallState) => void;
  onAllow?: (tool: AgentToolCallState) => void;
  onSkip: (tool: AgentToolCallState) => void;
}

function formatArgumentValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return String(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

// The card used to show only arguments.path, which left search and problem
// tools looking empty because their inputs are a query or filters, not a path.
// Showing every argument without a dedicated preview keeps the card honest
// about what the agent asked for.
function toolDetail(tool: AgentToolCallState) {
  const entries = Object.entries(tool.arguments).filter(
    ([key]) =>
      !(tool.name === "write_file" && key === "content") &&
      !(tool.name === "run_command" && key === "command") &&
      !(tool.name === "run_command" && key === "description"),
  );
  if (entries.length === 0) return null;
  return entries
    .map(([key, value]) => `${key}: ${formatArgumentValue(value)}`)
    .join("  ·  ");
}

// write_file content is often multi-line, so it gets its own collapsible
// preview instead of being squeezed into the one-line argument summary. The
// user needs to see what will be written before approving the action.
function writeContent(tool: AgentToolCallState) {
  return tool.name === "write_file" &&
    typeof tool.arguments.content === "string"
    ? tool.arguments.content
    : null;
}

// A shell command can be long enough that a truncated argument row hides the
// part that matters. The approval card shows the full command in its own block
// so the user can read exactly what will run.
function commandContent(tool: AgentToolCallState) {
  return tool.name === "run_command" &&
    typeof tool.arguments.command === "string"
    ? tool.arguments.command
    : null;
}

// The model explains why it needs the command, and that reason sits above the
// command so the user has context before approving the action.
function commandReason(tool: AgentToolCallState) {
  return tool.name === "run_command" &&
    typeof tool.arguments.description === "string"
    ? tool.arguments.description
    : null;
}

// These tools produce output the user needs to see immediately, such as the
// files, matches, or build errors the model is acting on. Opening them by
// default keeps the evidence out of a collapsed row.
const RESULT_VISIBLE_TOOLS = new Set([
  "list_files",
  "glob",
  "grep",
  "run_command",
]);

function ToolStatusIcon({ status }: { status: AgentToolCallState["status"] }) {
  if (status === "running") {
    return <Loader2 size={11} className="animate-spin" />;
  }
  if (status === "done") return <Check size={11} />;
  if (status === "rejected" || status === "error") return <X size={11} />;
  return <Play size={10} />;
}

function statusTone(status: AgentToolCallState["status"]) {
  if (status === "done") {
    return "bg-[var(--axon-git-added)]/12 text-[var(--axon-git-added)]";
  }
  if (status === "rejected" || status === "error") {
    return "bg-[var(--axon-danger-foreground)]/12 text-[var(--axon-danger-foreground)]";
  }
  return "bg-[var(--axon-syntax-function)]/15 text-[var(--axon-syntax-function)]";
}

export default function AgentToolCard({
  tool,
  onRun,
  onAllow,
  onSkip,
}: Props) {
  const detail = toolDetail(tool);
  const content = writeContent(tool);
  const command = commandContent(tool);
  const reason = commandReason(tool);
  const contentLines = content ? content.split("\n").length : 0;
  const resultLines = tool.result ? tool.result.split("\n").length : 0;
  const pending = tool.status === "pending";
  const [resultOpen, setResultOpen] = useState(
    RESULT_VISIBLE_TOOLS.has(tool.name),
  );

  return (
    <div
      className={`my-2 overflow-hidden rounded-lg border bg-[var(--axon-panel-background)] ${
        pending
          ? "border-[var(--axon-syntax-function)]/35 ring-1 ring-[var(--axon-syntax-function)]/10"
          : "border-[var(--axon-panel-border)]"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-[var(--axon-panel-border)] px-3 py-2">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${statusTone(tool.status)}`}
        >
          <ToolStatusIcon status={tool.status} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--axon-editor-foreground)]">
          {tool.title}
        </span>
        <span className="shrink-0 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)]/50 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-[var(--axon-editor-foreground)] opacity-45">
          {tool.kind}
        </span>
      </div>

      {detail && (
        <div className="truncate px-3 py-2 font-mono text-[10.5px] leading-4 text-[var(--axon-editor-foreground)] opacity-60">
          {detail}
        </div>
      )}

      {(reason !== null || command !== null) && (
        <div className="max-h-60 overflow-auto border-t border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)]/25 px-3 py-2">
          {reason !== null && (
            <div className="mb-2 whitespace-pre-wrap break-words text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-70">
              {reason}
            </div>
          )}
          {command !== null && (
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-75">
              {command}
            </pre>
          )}
        </div>
      )}

      {content !== null && (
        <details className="border-t border-[var(--axon-panel-border)]">
          <summary className="cursor-pointer px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--axon-editor-foreground)] opacity-50">
            Content · {contentLines} {contentLines === 1 ? "line" : "lines"}
          </summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words px-3 pb-2 pt-1 font-mono text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-70">
            {content}
          </pre>
        </details>
      )}

      {tool.result && (
        <details
          open={resultOpen}
          onToggle={(event) => setResultOpen(event.currentTarget.open)}
          className="border-t border-[var(--axon-panel-border)]"
        >
          <summary className="cursor-pointer px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--axon-editor-foreground)] opacity-50">
            Result · {resultLines} {resultLines === 1 ? "line" : "lines"}
          </summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words px-3 pb-2 pt-1 font-mono text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-70">
            {tool.result}
          </pre>
        </details>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        {pending ? (
          <>
            <span className="min-w-0 text-[11px] text-[var(--axon-editor-foreground)] opacity-50">
              Axon wants to run this action.
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onSkip(tool)}
                className="flex h-6 cursor-pointer items-center gap-1 rounded-md border border-[var(--axon-panel-border)] bg-transparent px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-60 transition-colors hover:opacity-100"
              >
                <SkipForward size={10} />
                Skip
              </button>
              {tool.name === "run_command" && onAllow && (
                <button
                  type="button"
                  onClick={() => onAllow(tool)}
                  title="Allow this exact command and working directory for this session"
                  className="flex h-6 cursor-pointer items-center gap-1 rounded-md border border-[var(--axon-panel-border)] bg-transparent px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-60 transition-colors hover:opacity-100"
                >
                  <ShieldCheck size={10} />
                  Allow
                </button>
              )}
              <button
                type="button"
                onClick={() => onRun(tool)}
                className="flex h-6 cursor-pointer items-center gap-1 rounded-md bg-[var(--axon-syntax-function)] px-2 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
              >
                <Play size={10} />
                Run
              </button>
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--axon-editor-foreground)] opacity-60">
            {tool.status === "running" && (
              <Loader2 size={11} className="animate-spin" />
            )}
            {tool.status === "done" && (
              <Check size={11} className="text-[var(--axon-git-added)]" />
            )}
            {(tool.status === "rejected" || tool.status === "error") && (
              <X size={11} className="text-[var(--axon-danger-foreground)]" />
            )}
            <span className="truncate">
              {tool.status === "running"
                ? "Running..."
                : tool.status === "done"
                  ? "Done"
                  : tool.status === "rejected"
                    ? "Skipped"
                    : tool.message || "Failed"}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
