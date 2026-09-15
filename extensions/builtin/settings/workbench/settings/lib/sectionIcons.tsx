/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// One Lucide icon per settings section, kept out of the sidebar and the
// settings page so future sections only touch this map and settingsData.
import {
  Image,
  Palette,
  Sparkles,
  SquareTerminal,
  Type,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { type SettingsSectionId } from "./settingsData";

export const SETTINGS_SECTION_ICONS: Record<SettingsSectionId, LucideIcon> = {
  appearance: Palette,
  editor: Type,
  terminal: SquareTerminal,
  background: Image,
  fonts: Type,
  ai: Sparkles,
  languageServers: Wifi,
};