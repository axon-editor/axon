/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Check, Loader2, Play, SkipForward, X } from "lucide-react";
import { type AgentToolCallState } from "../../lib/conversation/agentConversation";

interface Props {
  tool: AgentToolCallState;
  onRun: (tool: AgentToolCallState) => void;
  onSkip: (tool: AgentToolCallState) => void;
}

function toolDetail(tool: AgentToolCallState) {
  const path = tool.arguments.path;
  if (typeof path === "string" && path.trim()) return path;
  return null;
}

export default function AgentToolCard({ tool, onRun, onSkip }: Props) {
  const detail = toolDetail(tool);
  const pending = tool.status === "pending";

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)]">
      <div className="flex items-center gap-2 border-b border-[var(--axon-panel-border)] px-3 py-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--axon-syntax-function)]/15 text-[var(--axon-syntax-function)]">
          <Play size={10} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--axon-editor-foreground)]">
          {tool.title}
        </span>
        <span className="shrink-0 rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--axon-editor-foreground)] opacity-50">
          action
        </span>
      </div>

      {detail && (
        <div className="truncate px-3 py-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-60">
          {detail}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 px-3 py-2">
        {pending ? (
          <>
            <span className="text-[11px] text-[var(--axon-editor-foreground)] opacity-50">
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
            {tool.status === "running" && <Loader2 size={11} className="animate-spin" />}
            {tool.status === "done" && (
              <Check size={11} className="text-[#5ee6a8]" />
            )}
            {(tool.status === "rejected" || tool.status === "error") && (
              <X size={11} className="text-[#ff9ca8]" />
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
