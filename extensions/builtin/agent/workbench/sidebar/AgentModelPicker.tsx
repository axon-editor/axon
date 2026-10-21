/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useRef } from "react";
import { ArrowDownToLine, ChevronDown } from "lucide-react";
import { type AiModelInfo } from "@axon-editor/shared/ai/ai";
import Tooltip from "@axon-editor/renderer/shared/components/primitives/Tooltip";
import { usePopoverDismiss } from "../lib/hooks/usePopoverDismiss";
import AgentModelOption from "./AgentModelOption";

// Composer model picker. Installed and downloadable models are split into
// groups instead of being tagged row by row, so the labels can carry the state
// and the copy under each name is free to explain the memory fit, which is the
// question the picker actually exists to answer.
interface Props {
  hostMemoryGB?: number;
  models: AiModelInfo[];
  open: boolean;
  selectedModel: string;
  selectedModelAvailable: boolean;
  selectedModelLabel: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (modelId: string) => void;
}

function fitNote(model: AiModelInfo): string {
  if (model.compatibility === "unsupported") {
    return "Too much memory for this machine";
  }
  if (model.compatibility === "ok") {
    return "Runs close to this machine's memory limit";
  }
  return "";
}

export default function AgentModelPicker(props: Props) {
  const pickerRef = useRef<HTMLDivElement>(null);

  usePopoverDismiss(pickerRef, props.open, () => props.onOpenChange(false));

  const groups = [
    {
      label: "Installed",
      models: props.models.filter((model) => model.available),
    },
    {
      label: "Needs download",
      models: props.models.filter((model) => !model.available),
    },
  ].filter((group) => group.models.length > 0);

  return (
    <div ref={pickerRef} className="relative">
      <Tooltip label="Choose Axon model" side="left">
        <button
          type="button"
          onClick={() => props.onOpenChange(!props.open)}
          aria-label="Choose Axon model"
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
            {typeof props.hostMemoryGB === "number" && (
              <span className="text-[10px] tabular-nums text-[var(--axon-editor-foreground)] opacity-30">
                {props.hostMemoryGB} GB memory
              </span>
            )}
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
                <div key={group.label}>
                  <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--axon-editor-foreground)] opacity-35">
                    {group.label}
                  </div>
                  {group.models.map((model) => (
                    <AgentModelOption
                      key={model.id}
                      active={model.id === props.selectedModel}
                      label={model.label}
                      needsDownload={!model.available}
                      note={fitNote(model)}
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
        </div>
      )}
    </div>
  );
}
