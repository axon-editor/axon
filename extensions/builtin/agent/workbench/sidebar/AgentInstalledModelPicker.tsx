/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { type AiModelInfo } from "@axon-editor/shared/ai/ai";
import { usePopoverDismiss } from "../lib/hooks/usePopoverDismiss";
import AgentModelOption from "./AgentModelOption";

// Surface for the status panel: when the chosen model still needs a download,
// the user should be able to jump to an already-installed model without hunting
// for the composer picker. This renders only installed models, and the parent
// hides the whole block when nothing is installed, so the trigger is never a
// dead control that opens an empty menu.
interface Props {
  models: AiModelInfo[];
  selectedModel: string;
  onSelectModel: (model: string) => void;
}

export default function AgentInstalledModelPicker({
  models,
  selectedModel,
  onSelectModel,
}: Props) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  usePopoverDismiss(pickerRef, open, () => setOpen(false));

  const installedModels = models.filter((model) => model.available);
  const activeModel = installedModels.find(
    (model) => model.id === selectedModel,
  );

  const handleToggle = () => setOpen((current) => !current);

  const handleSelect = (model: string) => {
    onSelectModel(model);
    setOpen(false);
  };

  return (
    <div ref={pickerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-label="Choose an installed model"
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-[var(--axon-panel-border)] bg-transparent px-2.5 py-2 text-left transition-colors hover:border-[var(--axon-syntax-function)]/40"
      >
        <span className="min-w-0">
          <span className="block truncate text-[12px] text-[var(--axon-editor-foreground)]">
            {activeModel ? activeModel.label : "Choose an installed model"}
          </span>
          {activeModel?.description && (
            <span className="mt-0.5 block truncate text-[10px] leading-4 text-[var(--axon-editor-foreground)] opacity-40">
              {activeModel.description}
            </span>
          )}
        </span>
        <ChevronDown size={12} className="shrink-0 opacity-40" />
      </button>

      {open && (
        <div className="axon-popup-surface axon-agent-popup absolute bottom-full left-0 z-30 mb-1 w-full overflow-hidden rounded-xl border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] shadow-[0_18px_48px_rgba(0,0,0,0.45)] ring-1 ring-white/[0.04]">
          <div className="px-1.5 pb-2 pt-1.5">
            <div className="max-h-56 overflow-y-auto">
              {installedModels.map((model) => (
                <AgentModelOption
                  key={model.id}
                  active={model.id === selectedModel}
                  label={model.label}
                  note={model.description ?? ""}
                  onSelect={() => handleSelect(model.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
