/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { type AiModelInfo } from "@axon-editor/shared/ai/ai";
import { usePopoverDismiss } from "../lib/hooks/usePopoverDismiss";

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
  const activeModel = installedModels.find((model) => model.id === selectedModel);

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
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-[var(--axon-panel-border)] bg-transparent px-2.5 py-2 text-left text-[12px] text-[var(--axon-editor-foreground)] transition-colors hover:border-[var(--axon-syntax-function)]/40"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-[#5ee6a8]" />
          <span className="truncate">
            {activeModel ? activeModel.label : "Choose an installed model"}
          </span>
        </span>
        <ChevronDown size={12} className="shrink-0 opacity-40" />
      </button>
      {open && (
        <div className="axon-agent-popup absolute bottom-full left-0 z-30 mb-1 max-h-56 w-full overflow-y-auto rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-editor-background)] p-1 shadow-xl shadow-black/40">
          {installedModels.map((model) => {
            const active = model.id === selectedModel;
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => handleSelect(model.id)}
                className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                  active
                    ? "bg-[var(--axon-panel-overlay-hover)]"
                    : "hover:bg-[var(--axon-panel-overlay-hover)]"
                }`}
              >
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#5ee6a8]" />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] text-[var(--axon-editor-foreground)]">
                    {model.label}
                  </span>
                  {model.description && (
                    <span className="mt-0.5 block truncate text-[10px] text-[var(--axon-editor-foreground)] opacity-50">
                      {model.description}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
