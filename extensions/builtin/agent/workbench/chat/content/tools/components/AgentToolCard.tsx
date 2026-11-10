/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState } from "react";
import {
  Check,
  ExternalLink,
  Loader2,
  Play,
  ShieldCheck,
  SkipForward,
  X,
} from "lucide-react";
import { type AgentToolCallState } from "../../../../lib/conversation";
import { toolDetail } from "../model/arguments/toolDetail";
import { toolPath } from "../model/arguments/toolPath";
import { commandContent } from "../model/content/commandContent";
import { commandReason } from "../model/content/commandReason";
import { writeContent } from "../model/content/writeContent";
import { statusTone } from "../model/status/statusTone";
import { isFileTool } from "../model/titles/isFileTool";
import { toolTitle } from "../model/titles/toolTitle";
import ToolStatusIcon from "./ToolStatusIcon";

interface Props {
  tool: AgentToolCallState;
  onRun: (tool: AgentToolCallState) => void;
  onAllow?: (tool: AgentToolCallState) => void;
  onSkip: (tool: AgentToolCallState) => void;
  onOpenFile?: (path: string) => void;
}

export default function AgentToolCard({
  tool,
  onRun,
  onAllow,
  onSkip,
  onOpenFile,
}: Props) {
  const targetPath = toolPath(tool);
  const detail = toolDetail(tool, targetPath);
  const content = writeContent(tool);
  const command = commandContent(tool);
  const reason = commandReason(tool);
  const contentLines = content ? content.split("\n").length : 0;
  const resultLines = tool.result ? tool.result.split("\n").length : 0;
  const pending = tool.status === "pending";
  // Results are the evidence the user needs to judge the action, so every card
  // starts with its output visible. The user can still collapse a noisy result
  // and the choice survives subsequent status updates because it lives in state.
  const [resultOpen, setResultOpen] = useState(true);

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
          {toolTitle(tool)}
        </span>
        <span className="shrink-0 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-overlay-hover)]/50 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-[var(--axon-editor-foreground)] opacity-45">
          {tool.kind}
        </span>
      </div>

      {targetPath && (
        <div className="flex items-center gap-2 border-b border-[var(--axon-panel-border)] px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] leading-4 text-[var(--axon-editor-foreground)] opacity-70">
            {targetPath}
          </span>
          {onOpenFile && isFileTool(tool) && (
            <button
              type="button"
              onClick={() => onOpenFile(targetPath)}
              className="flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-45 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
              aria-label={`Open ${targetPath}`}
            >
              <ExternalLink size={10} />
              Open
            </button>
          )}
        </div>
      )}

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
              {tool.permissionOnly
                ? "OpenCode wants to run this action."
                : "Axon wants to run this action."}
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
              {(tool.name === "run_command" || tool.permissionOnly) &&
                onAllow && (
                  <button
                    type="button"
                    onClick={() => onAllow(tool)}
                    title={
                      tool.permissionOnly
                        ? "Allow this action for this session"
                        : "Allow this exact command and working directory for this session"
                    }
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
                {tool.permissionOnly ? "Allow once" : "Run"}
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
