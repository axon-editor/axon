import { type AxonSettings } from "@axon-editor/shared/settings";
import SearchSelect from "@axon-editor/base/components/SearchSelect";
import { MULTI_CURSOR_MODIFIER_ITEMS } from "./lib/settingsData";
import {
  SettingsField,
  SettingsSection,
  SettingsToggle,
} from "./SettingsControls";

export default function ErgonomicsSettingsSection({
  draft,
  onUpdateEditor,
}: {
  draft: AxonSettings;
  onUpdateEditor: <K extends keyof AxonSettings["editor"]>(
    key: K,
    value: AxonSettings["editor"][K],
  ) => void;
}) {
  return (
    <SettingsSection
      title="Ergonomics"
      description="Control the editor behaviors that affect daily writing, navigation, and reading. Changes apply immediately so you can feel the difference without restarting Axon."
    >
      <SettingsField
        label="Format on save"
        description="Runs the active language server formatter before writing the file. Saving still succeeds if a formatter is unavailable."
      >
        <SettingsToggle
          checked={draft.editor.formatOnSave}
          onChange={(checked) => onUpdateEditor("formatOnSave", checked)}
          label={draft.editor.formatOnSave ? "Enabled" : "Disabled"}
        />
      </SettingsField>

      <SettingsField
        label="Snippets"
        description="Shows Axon and language-server snippets in the completion popup."
      >
        <SettingsToggle
          checked={draft.editor.snippetsEnabled}
          onChange={(checked) => onUpdateEditor("snippetsEnabled", checked)}
          label={draft.editor.snippetsEnabled ? "Enabled" : "Disabled"}
        />
      </SettingsField>

      <SettingsField
        label="Emmet"
        description="Expands common HTML and JSX abbreviations such as .card, button.primary, and section.hero."
      >
        <SettingsToggle
          checked={draft.editor.emmetEnabled}
          onChange={(checked) => onUpdateEditor("emmetEnabled", checked)}
          label={draft.editor.emmetEnabled ? "Enabled" : "Disabled"}
        />
      </SettingsField>

      <SettingsField
        label="Multi-cursor modifier"
        description="Choose the modifier used for adding cursors with mouse clicks."
      >
        <SearchSelect
          value={draft.editor.multiCursorModifier}
          items={MULTI_CURSOR_MODIFIER_ITEMS}
          onChange={(modifier) => onUpdateEditor("multiCursorModifier", modifier)}
          ariaLabel="Multi-cursor modifier"
          placeholder="Select modifier..."
        />
      </SettingsField>

      <SettingsField
        label="Breadcrumbs"
        description="Shows the current file path and nearest symbol above the editor."
      >
        <SettingsToggle
          checked={draft.editor.breadcrumbsEnabled}
          onChange={(checked) => onUpdateEditor("breadcrumbsEnabled", checked)}
          label={draft.editor.breadcrumbsEnabled ? "Enabled" : "Disabled"}
        />
      </SettingsField>

      <SettingsField
        label="Sticky scroll"
        description="Keeps the current scope visible at the top while scrolling through long files."
      >
        <SettingsToggle
          checked={draft.editor.stickyScrollEnabled}
          onChange={(checked) => onUpdateEditor("stickyScrollEnabled", checked)}
          label={draft.editor.stickyScrollEnabled ? "Enabled" : "Disabled"}
        />
      </SettingsField>

      <SettingsField
        label="Code folding"
        description="Enables fold controls and folding keyboard commands."
      >
        <SettingsToggle
          checked={draft.editor.codeFoldingEnabled}
          onChange={(checked) => onUpdateEditor("codeFoldingEnabled", checked)}
          label={draft.editor.codeFoldingEnabled ? "Enabled" : "Disabled"}
        />
      </SettingsField>

      <SettingsField
        label="Minimap"
        description="Shows a compact file map on the right side of the editor."
      >
        <SettingsToggle
          checked={draft.editor.minimapEnabled}
          onChange={(checked) => onUpdateEditor("minimapEnabled", checked)}
          label={draft.editor.minimapEnabled ? "Enabled" : "Disabled"}
        />
      </SettingsField>

      <SettingsField
        label="Scrollbar markers"
        description="Shows diagnostics, search matches, and decorations in the overview ruler."
      >
        <SettingsToggle
          checked={draft.editor.scrollbarMarkersEnabled}
          onChange={(checked) =>
            onUpdateEditor("scrollbarMarkersEnabled", checked)
          }
          label={
            draft.editor.scrollbarMarkersEnabled ? "Enabled" : "Disabled"
          }
        />
      </SettingsField>
    </SettingsSection>
  );
}
