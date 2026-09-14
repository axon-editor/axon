/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import SearchSelect from "@axon-editor/base/components/SearchSelect";
import { type AxonSettings } from "@axon-editor/shared/settings";
import { TERMINAL_GPU_ACCELERATION_ITEMS } from "../lib/settingsData";
import SettingsField from "../controls/SettingsField";
import SettingsSection from "../controls/SettingsSection";

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
    <SettingsSection>
      <SettingsField
        label="GPU acceleration"
        description="Auto uses xterm's reliable DOM renderer. Choose On to opt into WebGL acceleration."
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