/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState } from "react";
import { type AxonSettings } from "@axon-editor/shared/core/settings";
import { type AiModelInfo } from "@axon-editor/shared/ai/ai";
import { RefreshCw } from "lucide-react";
import SearchSelect from "@axon-editor/base/components/SearchSelect";
import { AI_PROVIDER_ITEMS } from "../../lib/data/settingsData";
import SettingsField from "../../controls/layout/SettingsField";
import SettingsSection from "../../controls/layout/SettingsSection";
import SettingsToggle from "../../controls/inputs/SettingsToggle";

// modelCompatibilityNote explains, in one sentence, whether the host has enough
// memory for the model so the picker can steer people away from downloads that
// will not run well.
function modelCompatibilityNote(model: AiModelInfo) {
  if (model.compatibility === "unsupported") {
    const requirement = model.minMemoryGB
      ? ` Needs about ${model.minMemoryGB} GB of memory.`
      : "";
    return `Needs more memory than this machine has.${requirement}`;
  }
  if (model.compatibility === "ok") {
    return "Runs, but close to this machine's memory limit.";
  }
  return "";
}

export default function AxonAgentSettingsSection({
  draft,
  models,
  modelsError,
  modelsLoading,
  onRefreshModels,
  onUpdateAi,
}: {
  draft: AxonSettings;
  models: AiModelInfo[];
  modelsError: string | null;
  modelsLoading: boolean;
  onRefreshModels: () => void;
  onUpdateAi: <K extends keyof AxonSettings["ai"]>(
    key: K,
    value: AxonSettings["ai"][K],
  ) => void;
}) {
  const [showAllModels, setShowAllModels] = useState(false);
  const selectedModel = models.find((model) => model.id === draft.ai.model);
  const hiddenModelCount = models.filter(
    (model) => model.compatibility === "unsupported" && model.id !== draft.ai.model,
  ).length;
  const visibleModels = models.filter(
    (model) =>
      showAllModels || model.compatibility !== "unsupported" || model.id === draft.ai.model,
  );
  const modelItems = visibleModels.map((model) => ({
    value: model.id,
    label: model.label,
    description: [
      model.available ? "Ready" : "Download required",
      modelCompatibilityNote(model),
      model.description,
    ]
      .filter(Boolean)
      .join(" - "),
  }));

  if (
    draft.ai.model &&
    !modelItems.some((model) => model.value === draft.ai.model)
  ) {
    modelItems.unshift({
      value: draft.ai.model,
      label: draft.ai.model,
      description: "Current custom model",
    });
  }

  const selectedModelNote = selectedModel
    ? modelCompatibilityNote(selectedModel)
    : "";

  return (
    <SettingsSection>
      <SettingsField
        rowKey="assistant"
        label="Assistant"
        description="Controls whether Axon Agent commands and the side panel are available."
      >
        <SettingsToggle
          checked={draft.ai.enabled}
          onChange={(checked) => onUpdateAi("enabled", checked)}
          label={draft.ai.enabled ? "Enabled" : "Disabled"}
        />
      </SettingsField>

      <SettingsField
        rowKey="provider"
        label="Provider"
        description="Local model runtime used by Axon Agent."
      >
        <SearchSelect
          value={draft.ai.provider}
          items={AI_PROVIDER_ITEMS}
          onChange={(provider) => onUpdateAi("provider", provider)}
          ariaLabel="Axon model provider"
          placeholder="Search providers..."
        />
      </SettingsField>

      <SettingsField
        rowKey="model"
        label="Model"
        description="Choose from the Axon model catalog. Installed models are marked as ready, and models that need more memory than this machine has are hidden by default."
      >
        <div>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <SearchSelect
                value={draft.ai.model}
                items={modelItems}
                onChange={(model) => onUpdateAi("model", model)}
                ariaLabel="Axon model"
                placeholder={
                  modelsLoading ? "Loading models..." : "Search models..."
                }
                emptyLabel="No Axon models available"
              />
            </div>
            <button
              type="button"
              onClick={onRefreshModels}
              disabled={modelsLoading}
              title="Refresh available models"
              aria-label="Refresh available models"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] text-[var(--axon-editor-foreground)] transition-colors hover:bg-[var(--axon-panel-overlay-hover)] disabled:cursor-wait disabled:opacity-45"
            >
              <RefreshCw
                size={13}
                className={modelsLoading ? "animate-spin" : ""}
              />
            </button>
          </div>
          <div
            className="mt-2 flex items-start gap-2 text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-60"
            aria-live="polite"
          >
            <span
              className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                selectedModel?.available
                  ? "bg-[var(--axon-syntax-string)]"
                  : "bg-[var(--axon-editor-foreground)] opacity-45"
              }`}
            />
            <span>
              {modelsLoading
                ? "Checking the local Axon model catalog..."
                : modelsError
                  ? `Could not refresh models: ${modelsError}`
                  : selectedModel
                    ? [
                        selectedModel.available ? "Ready" : "Download required",
                        selectedModelNote,
                        selectedModel.description,
                      ]
                        .filter(Boolean)
                        .join(". ")
                    : "The current custom model is not part of the Axon catalog."}
            </span>
          </div>
          {hiddenModelCount > 0 && (
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] leading-4 text-[var(--axon-editor-foreground)] opacity-70">
              <input
                type="checkbox"
                checked={showAllModels}
                onChange={(event) => setShowAllModels(event.target.checked)}
                className="h-3 w-3 accent-[var(--axon-accent)]"
              />
              Show models that need more memory ({hiddenModelCount})
            </label>
          )}
        </div>
      </SettingsField>

      <SettingsField
        rowKey="inline-completions"
        label="Inline completions"
        description="Shows local AI ghost text directly in the editor while typing. The completion still uses the selected Axon model and never bypasses workspace authorization."
      >
        <SettingsToggle
          checked={draft.ai.inlineCompletionsEnabled}
          onChange={(checked) =>
            onUpdateAi("inlineCompletionsEnabled", checked)
          }
          label={draft.ai.inlineCompletionsEnabled ? "Enabled" : "Disabled"}
        />
      </SettingsField>

      <SettingsField
        rowKey="workspace-context"
        label="Workspace context"
        description="Allows Axon Agent actions to include active files, diagnostics, Git changes, and selected project context."
      >
        <SettingsToggle
          checked={draft.ai.includeWorkspaceContext}
          onChange={(checked) =>
            onUpdateAi("includeWorkspaceContext", checked)
          }
          label={draft.ai.includeWorkspaceContext ? "Included" : "Excluded"}
        />
      </SettingsField>
    </SettingsSection>
  );
}