import { type AxonSettings } from "@axon-editor/shared/settings";
import { type AiModelInfo } from "@axon-editor/shared/ai";
import { RefreshCw } from "lucide-react";
import SearchSelect from "@axon-editor/base/components/SearchSelect";
import { AI_PROVIDER_ITEMS } from "./lib/settingsData";
import {
  SettingsField,
  SettingsSection,
  SettingsToggle,
} from "./SettingsControls";

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
  const selectedModel = models.find((model) => model.id === draft.ai.model);
  const modelItems = models.map((model) => ({
    value: model.id,
    label: model.label,
    description: `${model.available ? "Ready" : "Download required"}${
      model.description ? ` - ${model.description}` : ""
    }`,
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

  return (
    <SettingsSection
      title="Axon Agent"
      description="Local Axon models power project-aware chat, explanations, fixes, tests, diff review, and commit drafting without exposing third-party providers in the UI."
    >
      <SettingsField
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
        label="Model"
        description="Choose from the Axon model catalog. Installed models are marked as ready."
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
                    ? `${selectedModel.available ? "Ready" : "Download required"}${
                        selectedModel.description
                          ? `. ${selectedModel.description}`
                          : "."
                      }`
                    : "The current custom model is not part of the Axon catalog."}
            </span>
          </div>
        </div>
      </SettingsField>

      <SettingsField
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
