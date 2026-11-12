/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useRef } from "react";
import {
  ArrowDownToLine,
  ChevronDown,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { type AiModelInfo } from "@axon-editor/shared/ai/ai";
import Tooltip from "@axon-editor/renderer/shared/components/primitives/Tooltip";
import { usePopoverDismiss } from "../../../lib/hooks/usePopoverDismiss";
import { groupAgentModels, agentModelNote } from "../model/agentModelGroups";
import AgentModelOption from "./AgentModelOption";

// Composer model picker. Models are grouped by the provider that runs them
// instead of by installation state, so a long OpenCode catalog cannot bury the
// Axon models it sits beside. The row note still carries the download or memory
// detail that the old groups used to explain.
interface Props {
  hostMemoryGB?: number;
  models: AiModelInfo[];
  open: boolean;
  selectedModel: string;
  selectedModelAvailable: boolean;
  selectedModelLabel: string;
  onOpenChange: (open: boolean) => void;
  onReconnectOpenCode?: () => void;
  onRefresh?: () => void;
  onSelect: (modelId: string) => void;
  reconnectDisabled?: boolean;
}

export default function AgentModelPicker(props: Props) {
  const pickerRef = useRef<HTMLDivElement>(null);

  usePopoverDismiss(pickerRef, props.open, () => props.onOpenChange(false));

  const groups = groupAgentModels(props.models);

  return (
    <div ref={pickerRef} className="relative">
      <Tooltip label="Choose model" side="left">
        <button
          type="button"
          onClick={() => props.onOpenChange(!props.open)}
          aria-label="Choose model"
          aria-expanded={props.open}
          className="flex h-7 max-w-[150px] cursor-pointer items-center gap-1.5 rounded-md border border-[var(--axon-panel-border)] bg-transparent px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-50 transition-colors hover:border-[var(--axon-syntax-function)]/40 hover:opacity-100"
        >
          <span className="truncate">{props.selectedModelLabel}</span>
          {!props.selectedModelAvailable && (
            <ArrowDownToLine size={10} className="shrink-0 opacity-40" />
          )}
          <ChevronDown size={10} className="shrink-0 opacity-40" />
        </button>
      </Tooltip>

      {props.open && (
        <div className="axon-popup-surface axon-agent-popup absolute bottom-8 left-0 z-30 w-[300px] overflow-hidden rounded-xl border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] shadow-[0_24px_64px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.04]">
          <div className="flex items-center justify-between border-b border-[var(--axon-panel-border)] px-3 py-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--axon-editor-foreground)] opacity-45">
              Model
            </span>
            <div className="flex items-center gap-2">
              {typeof props.hostMemoryGB === "number" && (
                <span className="text-[10px] tabular-nums text-[var(--axon-editor-foreground)] opacity-30">
                  {props.hostMemoryGB} GB memory
                </span>
              )}
              {props.onRefresh && (
                <button
                  type="button"
                  onClick={props.onRefresh}
                  aria-label="Refresh models"
                  title="Refresh models"
                  className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-[var(--axon-editor-foreground)] opacity-35 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
                >
                  <RefreshCw size={11} />
                </button>
              )}
            </div>
          </div>

          {/* The bottom gap lives outside the scroll box so it stays visible
              while the list is clipped mid-scroll instead of only appearing
              once the user reaches the end. */}
          <div className="px-1.5 pb-2 pt-1">
            <div className="max-h-[272px] overflow-y-auto">
              {groups.length === 0 && (
                <div className="px-2.5 py-4 text-center text-[11px] text-[var(--axon-editor-foreground)] opacity-40">
                  No models reported by the runtime
                </div>
              )}

              {groups.map((group) => (
                <div key={group.key}>
                  <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
                    <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--axon-editor-foreground)] opacity-35">
                      {group.label}
                    </span>
                    <span className="text-[9px] tabular-nums text-[var(--axon-editor-foreground)] opacity-20">
                      {group.models.length}
                    </span>
                  </div>
                  {group.models.map((model) => (
                    <AgentModelOption
                      key={model.id}
                      active={model.id === props.selectedModel}
                      label={model.label}
                      needsDownload={!model.available}
                      note={agentModelNote(model)}
                      onSelect={() => {
                        props.onSelect(model.id);
                        props.onOpenChange(false);
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {props.onReconnectOpenCode && (
            <div className="border-t border-[var(--axon-panel-border)] px-3 py-2">
              <button
                type="button"
                onClick={props.onReconnectOpenCode}
                disabled={props.reconnectDisabled}
                title="Restart the managed OpenCode server to reload installation and account changes"
                className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[var(--axon-panel-border)] bg-transparent px-2 py-1.5 text-[10px] text-[var(--axon-editor-foreground)] opacity-55 transition-colors hover:border-[var(--axon-syntax-function)]/40 hover:opacity-100 disabled:cursor-default disabled:opacity-25"
              >
                <RotateCcw size={10} />
                Reconnect OpenCode
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
