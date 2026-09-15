/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AxonSettings } from "@axon-editor/shared/settings";
import SearchSelect, { type SearchSelectItem } from "@axon-editor/base/components/SearchSelect";
import { EDITOR_SETTINGS_SURFACE_ITEMS, EDITOR_SIDEBAR_SIDE_ITEMS } from "../lib/settingsData";
import SettingsField from "../controls/SettingsField";
import SettingsSection from "../controls/SettingsSection";

export default function AppearanceSettingsSection({
  draft,
  themeItems,
  uiFontItems,
  onUpdateEditor,
}: {
  draft: AxonSettings;
  themeItems: SearchSelectItem<string>[];
  uiFontItems: SearchSelectItem<string>[];
  onUpdateEditor: <K extends keyof AxonSettings["editor"]>(
    key: K,
    value: AxonSettings["editor"][K],
  ) => void;
}) {
  return (
    <SettingsSection>
      <SettingsField
        rowKey="theme"
        label="Theme"
        description="Applies to editor chrome, panels, terminal, and Monaco."
      >
        <SearchSelect
          value={draft.editor.themeId}
          items={themeItems}
          onChange={(themeId) => onUpdateEditor("themeId", themeId)}
          ariaLabel="Theme"
          placeholder="Search themes..."
        />
      </SettingsField>

      <SettingsField
        rowKey="ui-font"
        label="UI font"
        description="Controls Axon interface text outside the editor buffer."
      >
        <SearchSelect
          value={draft.editor.uiFontFamily}
          items={uiFontItems}
          onChange={(fontFamily) => onUpdateEditor("uiFontFamily", fontFamily)}
          ariaLabel="UI font"
          placeholder="Search UI fonts..."
        />
      </SettingsField>

      <SettingsField
        rowKey="settings-surface"
        label="Open settings in"
        description="Choose the tab inside the editor or a dedicated settings window that all editor windows reuse."
      >
        <SearchSelect
          value={draft.editor.openSettingsIn}
          items={EDITOR_SETTINGS_SURFACE_ITEMS}
          onChange={(surface) => onUpdateEditor("openSettingsIn", surface)}
          ariaLabel="Settings surface"
          placeholder="Search surfaces..."
        />
      </SettingsField>

      <SettingsField
        rowKey="sidebar-side"
        label="Sidebar side"
        description="Moves the Files, History, and Spotify sidebar to the left or right of the editor."
      >
        <SearchSelect
          value={draft.editor.sidebarSide}
          items={EDITOR_SIDEBAR_SIDE_ITEMS}
          onChange={(side) => onUpdateEditor("sidebarSide", side)}
          ariaLabel="Main sidebar side"
          placeholder="Search sides..."
        />
      </SettingsField>
    </SettingsSection>
  );
}