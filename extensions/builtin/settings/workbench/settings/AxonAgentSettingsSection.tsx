import { type AxonSettings } from "@axon-editor/shared/settings";
import SearchSelect from "@axon-editor/base/components/SearchSelect";
import { AI_PROVIDER_ITEMS } from "./lib/settingsData";
import {
  SettingsField,
  SettingsSection,
  SettingsTextInput,
  SettingsToggle,
} from "./SettingsControls";

export default function AxonAgentSettingsSection({
  draft,
  onUpdateAi,
}: {
  draft: AxonSettings;
  onUpdateAi: <K extends keyof AxonSettings["ai"]>(
    key: K,
    value: AxonSettings["ai"][K],
  ) => void;
}) {
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
        description="Axon model name. Advanced users can point this at another local model without changing the provider UI."
      >
        <SettingsTextInput
          value={draft.ai.model}
          onChange={(value) => onUpdateAi("model", value)}
          placeholder="axon-code"
        />
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
