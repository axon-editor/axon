/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FolderOpen } from "lucide-react";
import { type AxonSettings } from "@axon-editor/shared/settings";
import SearchSelect from "@axon-editor/base/components/SearchSelect";
import SettingsButton from "../controls/SettingsButton";
import SettingsField from "../controls/SettingsField";
import SettingsNumberSlider from "../controls/SettingsNumberSlider";
import SettingsSection from "../controls/SettingsSection";
import SettingsTextInput from "../controls/SettingsTextInput";
import {
  APP_GLASS_MODE_ITEMS,
  EDITOR_BACKGROUND_IMAGE_FIT_ITEMS,
} from "../lib/settingsData";

type UpdateEditor = <K extends keyof AxonSettings["editor"]>(
  key: K,
  value: AxonSettings["editor"][K],
) => void;

export default function BackgroundSettingsSection({
  backgroundImageError,
  draft,
  onSelectEditorBackgroundImage,
  onUpdateEditor,
}: {
  backgroundImageError: string | null;
  draft: AxonSettings;
  onSelectEditorBackgroundImage: () => void;
  onUpdateEditor: UpdateEditor;
}) {
  return (
    <SettingsSection>
      <SettingsField
        label="App glass"
        description="System Glass favors efficiency. Live Glass requests a continuously blurred native material where the operating system supports one."
      >
        <SearchSelect
          value={draft.editor.appGlassMode}
          items={APP_GLASS_MODE_ITEMS}
          onChange={(mode) => onUpdateEditor("appGlassMode", mode)}
          ariaLabel="Application glass mode"
          placeholder="Search glass modes..."
        />
      </SettingsField>

      <SettingsField
        label="Overlay opacity"
        description="Controls the readable backing behind modals and popups. The editor, sidebars, and persistent chrome remain untinted native glass."
      >
        <SettingsNumberSlider
          min={0.2}
          max={1}
          step={0.01}
          value={draft.editor.appBackgroundOpacity}
          onChange={(value) => onUpdateEditor("appBackgroundOpacity", value)}
        />
      </SettingsField>

      <SettingsField
        label="Surface blur"
        description="Controls the local blur and translucent glass directly behind modal and popup content. The surrounding app remains unblurred."
      >
        <SettingsNumberSlider
          min={0}
          max={40}
          step={1}
          value={draft.editor.appBackgroundBlur}
          onChange={(value) => onUpdateEditor("appBackgroundBlur", value)}
        />
      </SettingsField>

      <SettingsField
        label="Editor image"
        description="Choose a local image to render behind the editor buffer."
      >
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <SettingsButton
              label="Choose image"
              icon={<FolderOpen size={13} />}
              tone="primary"
              onClick={onSelectEditorBackgroundImage}
            />
            <SettingsButton
              label="Clear"
              tone="danger"
              disabled={!draft.editor.backgroundImagePath}
              onClick={() => onUpdateEditor("backgroundImagePath", "")}
            />
          </div>
          <SettingsTextInput
            value={draft.editor.backgroundImagePath}
            onChange={(value) => onUpdateEditor("backgroundImagePath", value)}
            placeholder="/absolute/path/to/background.png"
            monospace
          />
          {backgroundImageError && (
            <div className="text-[11px] text-[var(--axon-danger-foreground)]">
              {backgroundImageError}
            </div>
          )}
        </div>
      </SettingsField>

      <SettingsField
        label="Image opacity"
        description="Allowed range 0-1. Keep this low so code stays readable."
      >
        <SettingsNumberSlider
          min={0}
          max={1}
          step={0.01}
          value={draft.editor.backgroundImageOpacity}
          onChange={(value) => onUpdateEditor("backgroundImageOpacity", value)}
        />
      </SettingsField>

      <SettingsField
        label="Image blur"
        description="Allowed range 0-40px. Blur only affects the background image layer, not the editor text."
      >
        <SettingsNumberSlider
          min={0}
          max={40}
          step={1}
          value={draft.editor.backgroundImageBlur}
          onChange={(value) => onUpdateEditor("backgroundImageBlur", value)}
        />
      </SettingsField>

      <SettingsField
        label="Image fit"
        description="Controls how the image fills the editor surface."
      >
        <SearchSelect
          value={draft.editor.backgroundImageFit}
          items={EDITOR_BACKGROUND_IMAGE_FIT_ITEMS}
          onChange={(fit) => onUpdateEditor("backgroundImageFit", fit)}
          ariaLabel="Editor background image fit"
          placeholder="Search image fit..."
        />
      </SettingsField>
    </SettingsSection>
  );
}