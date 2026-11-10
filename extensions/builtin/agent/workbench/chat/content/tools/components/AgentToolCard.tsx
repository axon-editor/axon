/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
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
import { isReadTool } from "../model/titles/isReadTool";
import { toolTitle } from "../model/titles/toolTitle";
import ToolStatusIcon from "./ToolStatusIcon";

interface Props {
  tool: AgentToolCallState;
  onRun: (tool: AgentToolCallState) => void;
  onAllow?: (tool: AgentToolCallState) => void;
  onSkip: (tool: AgentToolCallState) => void;
  onOpenFile?: (path: string) => void;
}

function toolSummary(
  targetPath: string | null,
  command: string | null,
  detail: string | null,
) {
  return targetPath ?? command ?? detail;
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
  const pending = tool.status === "pending";
  const isRead = isReadTool(tool);
  const isCommand = command !== null;
  const summary = toolSummary(targetPath, command, detail);

  // A pending approval must be visible, but everything else starts compact.
  // The status effect below opens approvals and closes finished/running cards
  // unless the user manually chose a state for this card.
  const [expanded, setExpanded] = useState(pending);
  const [outputOpen, setOutputOpen] = useState(false);
  const userToggledRef = useRef(false);
  const previousStatusRef = useRef(tool.status);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = tool.status;

    if (tool.status === "pending") {
      setExpanded(true);
      userToggledRef.current = false;
      return;
    }

    if (userToggledRef.current || previousStatus === tool.status) return;
    setExpanded(false);
  }, [tool.status]);

  const toggleExpanded = () => {
    userToggledRef.current = true;
    setExpanded((current) => !current);
  };

  return (
    <div
      className={`my-2 overflow-hidden rounded-lg border bg-[var(--axon-panel-background)] ${
        pending
          ? "border-[var(--axon-syntax-function)]/35 ring-1 ring-[var(--axon-syntax-function)]/10"
          : "border-[var(--axon-panel-border)]"
      }`}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded text-left"
        >
          <ChevronRight
            size={12}
            className={`shrink-0 text-[var(--axon-editor-foreground)] opacity-35 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${statusTone(tool.status)}`}
          >
            <ToolStatusIcon status={tool.status} />
          </span>
          <span className="shrink-0 text-[12px] font-medium text-[var(--axon-editor-foreground)]">
            {toolTitle(tool)}
          </span>
          {summary && (
            <span className="min-w-0 truncate font-mono text-[10.5px] leading-4 text-[var(--axon-editor-foreground)] opacity-45">
              {summary}
            </span>
          )}
        </button>

        {onOpenFile && targetPath && isFileTool(tool) && (
          <button
            type="button"
            onClick={() => onOpenFile(targetPath)}
            className="flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-40 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
            aria-label={`Open ${targetPath}`}
          >
            <ExternalLink size={10} />
            Open
          </button>
        )}

      </div>

      {expanded && (
        <div className="border-t border-[var(--axon-panel-border)]">
          {isRead ? (
            <>
              {detail && (
                <div className="border-b border-[var(--axon-panel-border)] px-3 py-1.5 font-mono text-[10.5px] leading-4 text-[var(--axon-editor-foreground)] opacity-55">
                  {detail}
                </div>
              )}
              <div className="px-3 py-2 text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-45">
                File content is hidden. Use Open to inspect it in the editor.
              </div>
            </>
          ) : (
            <>
              {detail && (
                <div className="border-b border-[var(--axon-panel-border)] px-3 py-1.5 font-mono text-[10.5px] leading-4 text-[var(--axon-editor-foreground)] opacity-55">
                  {detail}
                </div>
              )}

              {(reason !== null || command !== null) && (
                <div className="border-b border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)]/25 px-3 py-2">
                  {reason !== null && (
                    <div className="mb-2 whitespace-pre-wrap break-words text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-65">
                      {reason}
                    </div>
                  )}
                  {command !== null && (
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-70">
                      {command}
                    </pre>
                  )}
                </div>
              )}

              {content !== null && (
                <details className="border-b border-[var(--axon-panel-border)]">
                  <summary className="cursor-pointer px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] text-[var(--axon-editor-foreground)] opacity-45">
                    Content · {contentLines}{" "}
                    {contentLines === 1 ? "line" : "lines"}
                  </summary>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words px-3 pb-2 pt-1 font-mono text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-65">
                    {content}
                  </pre>
                </details>
              )}

              {tool.result &&
                (isCommand ? (
                  <div className="border-b border-[var(--axon-panel-border)]">
                    <button
                      type="button"
                      onClick={() => setOutputOpen((current) => !current)}
                      className="flex w-full cursor-pointer items-center px-3 py-1.5 text-left text-[10px] uppercase tracking-[0.08em] text-[var(--axon-editor-foreground)] opacity-45 hover:opacity-80"
                    >
                      {outputOpen ? "Hide output" : "Show output"}
                    </button>
                    {outputOpen && (
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words px-3 pb-2 pt-0 font-mono text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-65">
                        {tool.result}
                      </pre>
                    )}
                  </div>
                ) : (
                  <div className="border-b border-[var(--axon-panel-border)]">
                    <div className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.08em] text-[var(--axon-editor-foreground)] opacity-45">
                      Result
                    </div>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words px-3 pb-2 font-mono text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-65">
                      {tool.result}
                    </pre>
                  </div>
                ))}

              {(tool.status === "error" || tool.status === "rejected") &&
                tool.message && (
                  <div className="px-3 py-1.5 text-[11px] leading-4 text-[var(--axon-danger-foreground)] opacity-80">
                    {tool.message}
                  </div>
                )}
            </>
          )}

          {pending ? (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
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
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-[var(--axon-editor-foreground)] opacity-55">
              {tool.status === "running" && (
                <Loader2 size={11} className="animate-spin" />
              )}
              {tool.status === "done" && (
                <Check size={11} className="text-[var(--axon-git-added)]" />
              )}
              {tool.status === "rejected" && (
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
