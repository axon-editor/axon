import SearchSelect from "@axon-editor/base/components/SearchSelect";
import { type AxonSettings } from "@axon-editor/shared/settings";
import { TERMINAL_GPU_ACCELERATION_ITEMS } from "./lib/settingsData";
import { SettingsField, SettingsSection } from "./SettingsControls";

export default function TerminalSettingsSection({
  draft,
  onUpdateTerminal,
}: {
  draft: AxonSettings;
  onUpdateTerminal: <K extends keyof AxonSettings["terminal"]>(
    key: K,
    value: AxonSettings["terminal"][K],
  ) => void;
}) {
  return (
    <SettingsSection
      title="Terminal"
      description="Control how integrated terminals render changing text and long-running command output."
    >
      <SettingsField
        label="GPU acceleration"
        description="Auto uses WebGL when available and falls back to the DOM renderer when the GPU context is unavailable."
      >
        <SearchSelect
          value={draft.terminal.gpuAcceleration}
          items={TERMINAL_GPU_ACCELERATION_ITEMS}
          onChange={(mode) => onUpdateTerminal("gpuAcceleration", mode)}
          ariaLabel="Terminal GPU acceleration"
          placeholder="Select GPU acceleration..."
        />
      </SettingsField>
    </SettingsSection>
  );
}
