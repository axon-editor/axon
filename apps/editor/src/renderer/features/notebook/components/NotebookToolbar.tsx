/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Play, Plus, RotateCw, Square, Type } from "lucide-react";
import Tooltip from "@axon-editor/renderer/shared/components/primitives/Tooltip";
import { type KernelStatus } from "../session/useKernelSession";

interface Props {
  kernelStatus: KernelStatus;
  kernelName: string | null;
  saving: boolean;
  running: boolean;
  onRunAll: () => void;
  onInterrupt: () => void;
  onRestart: () => void;
  onInsertCode: () => void;
  onInsertMarkdown: () => void;
}

function statusColor(kernelStatus: KernelStatus) {
  switch (kernelStatus) {
    case "ready":
    case "busy":
      return "var(--axon-success-foreground,#7fd88f)";
    case "connecting":
      return "var(--axon-warning-foreground,#d0a24c)";
    default:
      return "var(--axon-error-foreground,#e06c75)";
  }
}

function statusLabel(kernelStatus: KernelStatus, kernelName: string | null) {
  if (kernelStatus === "ready") return kernelName ?? "Kernel ready";
  if (kernelStatus === "busy") {
    return kernelName ? `${kernelName} · running` : "Running";
  }
  if (kernelStatus === "connecting") return "Starting kernel...";
  if (kernelStatus === "disconnected") return "Kernel disconnected";
  return "Kernel error";
}

export default function NotebookToolbar({
  kernelStatus,
  kernelName,
  saving,
  running,
  onRunAll,
  onInterrupt,
  onRestart,
  onInsertCode,
  onInsertMarkdown,
}: Props) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-[var(--axon-panel-border)] bg-[var(--axon-toolbar-background)] px-2 py-1">
      <Tooltip label="Run all cells" side="bottom">
        <button
          type="button"
          onClick={onRunAll}
          disabled={running}
          aria-label="Run all cells"
          className="cursor-pointer rounded p-1 text-[var(--axon-editor-foreground)] opacity-60 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100 disabled:cursor-default disabled:opacity-25"
        >
          <Play size={13} />
        </button>
      </Tooltip>
      <Tooltip label="Interrupt kernel" side="bottom">
        <button
          type="button"
          onClick={onInterrupt}
          aria-label="Interrupt kernel"
          className="cursor-pointer rounded p-1 text-[var(--axon-editor-foreground)] opacity-60 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
        >
          <Square size={13} />
        </button>
      </Tooltip>
      <Tooltip label="Restart kernel" side="bottom">
        <button
          type="button"
          onClick={onRestart}
          aria-label="Restart kernel"
          className="cursor-pointer rounded p-1 text-[var(--axon-editor-foreground)] opacity-60 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
        >
          <RotateCw size={13} />
        </button>
      </Tooltip>
      <span className="mx-1 h-4 w-px bg-[var(--axon-panel-border)]" />
      <Tooltip label="Add code cell" side="bottom">
        <button
          type="button"
          onClick={onInsertCode}
          aria-label="Add code cell"
          className="cursor-pointer rounded p-1 text-[var(--axon-editor-foreground)] opacity-60 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
        >
          <span className="flex items-center gap-1 text-[11px]">
            <Plus size={12} />
            <span className="font-mono">Code</span>
          </span>
        </button>
      </Tooltip>
      <Tooltip label="Add markdown cell" side="bottom">
        <button
          type="button"
          onClick={onInsertMarkdown}
          aria-label="Add markdown cell"
          className="cursor-pointer rounded p-1 text-[var(--axon-editor-foreground)] opacity-60 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
        >
          <span className="flex items-center gap-1 text-[11px]">
            <Type size={12} />
            <span className="font-mono">Markdown</span>
          </span>
        </button>
      </Tooltip>

      <div className="flex-1" />
      {saving && (
        <span className="text-[11px] text-[var(--axon-editor-foreground)] opacity-45">
          saving...
        </span>
      )}
      <span className="flex items-center gap-1.5 px-1 text-[11px] text-[var(--axon-editor-foreground)] opacity-60">
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: statusColor(kernelStatus) }}
        />
        {statusLabel(kernelStatus, kernelName)}
      </span>
    </div>
  );
}
