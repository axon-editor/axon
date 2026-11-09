/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useRef } from "react";
import { ChevronDown } from "lucide-react";
import { type AiActionId } from "@axon-editor/shared/ai/ai";
import {
  agentActionLabels,
  agentQuickActions,
} from "../../../lib/actions/agentActions";
import { usePopoverDismiss } from "../../../lib/hooks/usePopoverDismiss";

interface Props {
  action: AiActionId;
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (action: AiActionId) => void;
}

export default function AgentComposerActionPicker({
  action,
  disabled,
  open,
  onOpenChange,
  onSelect,
}: Props) {
  const pickerRef = useRef<HTMLDivElement>(null);

  usePopoverDismiss(pickerRef, open, () => onOpenChange(false));

  return (
    <div ref={pickerRef} className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        disabled={disabled}
        className="flex h-7 max-w-[120px] cursor-pointer items-center gap-1 rounded-md border border-[var(--axon-panel-border)] bg-transparent px-2 text-[11px] text-[var(--axon-editor-foreground)] opacity-50 transition-colors hover:border-[var(--axon-syntax-function)]/40 hover:opacity-100 disabled:cursor-default disabled:opacity-20 disabled:hover:border-[var(--axon-panel-border)] disabled:hover:opacity-20"
        aria-label="Choose AI action"
      >
        <span className="truncate">{agentActionLabels[action]}</span>
        <ChevronDown size={10} className="shrink-0 opacity-40" />
      </button>
      {open && (
        <div className="axon-popup-surface axon-agent-popup absolute bottom-8 left-0 z-30 w-[190px] overflow-hidden rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] p-1.5 shadow-2xl shadow-black/50">
          {(["agent", ...agentQuickActions] as AiActionId[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                onSelect(item);
                onOpenChange(false);
              }}
              className={`flex h-7 w-full cursor-pointer items-center rounded-md px-2 text-left text-[11px] transition ${
                action === item
                  ? "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-editor-foreground)]"
                  : "text-[var(--axon-editor-foreground)] opacity-60 hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100"
              }`}
            >
              {agentActionLabels[item]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
